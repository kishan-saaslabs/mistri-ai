import { getEmbeddingClient, type DealBlock } from "@mistri-ai/ai";
import { CallInsightModel } from "../models/callInsightModel.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";
import { ChunkModel, type ChunkRecord } from "../models/chunkModel.js";
import { DealModel } from "../models/dealModel.js";
import { TopicSegmentModel } from "../models/topicSegmentModel.js";
import { TranscriptionModel } from "../models/transcriptionModel.js";
import { HttpError } from "../utils/httpError.js";
import { CallService, DealService } from "./callService.js";

export type ChatScopeInput = {
  scopeType: "call" | "deal" | "global";
  scopeCallId?: string;
  scopeDealId?: string;
  /** 'global' only — narrow "everything you can see" down to just these deals/calls. */
  focusDealIds?: string[];
  focusCallIds?: string[];
};

export type DealMention = { dealId: string; dealName: string };

export type ResolvedScope = {
  transcriptionIds: string[];
  scopeDescription: string;
};

export type Route = "SEMANTIC" | "WHOLE_CALL" | "STRUCTURED_LITE" | "STRUCTURED_AGGREGATE" | "DEAL_SYNTHESIS";

export type StructuredField = "objections" | "nextSteps" | "outcome" | "summary" | "customerWants";

export type BoundedBlock = {
  chunkId: string;
  transcriptionId: string;
  callId: string;
  segmentIds: string[];
  shownText: string;
  attributionUncertain: boolean;
};

const WHOLE_CALL_PATTERNS = [
  /summari[sz]e (this|the) call/i,
  /^recap\b/i,
  /what happened on (this|the) call/i,
  /walk me through (this|the) call/i,
];

const STRUCTURED_FIELD_PATTERNS: [RegExp, StructuredField][] = [
  [/objections?/i, "objections"],
  [/next steps?|action items?/i, "nextSteps"],
  [/outcome|verdict/i, "outcome"],
  [/customer wants?/i, "customerWants"],
];

// Aggregate/account-structure questions ("how many deals", "what deals do I
// have") have no transcript evidence to retrieve at all — nobody says "you
// have 4 deals" on a sales call. These are answered from a direct DB count/
// listing instead, never semantic search. Deliberately not scoped to 'call'
// (a fixed single call has no meaningful "how many deals" question).
//
// The trigger word must sit close to "deal(s)" (only small filler words —
// are/the/my/open — allowed between them), not just appear anywhere in the
// same sentence: "what did the customer say about the deal" is a genuine
// content question and must NOT be hijacked into a deal listing just for
// containing the word "deal" — confirmed this was a real false positive
// before this constraint was added.
const AGGREGATE_QUESTION_PATTERN =
  /how many (deals?|calls?)\b|\b(list|what|which)(\s+are)?(\s+the)?(\s+my)?(\s+open)?\s+deals?\b/i;

// Cross-deal/cross-call reasoning ("which deal needs attention", "score for
// X", "compare X and Y", "which deals have no next steps") — needs an actual
// judgment synthesized across a deal's (or every deal's) recorded
// objections/next-steps, not a single fact lookup. Checked BEFORE
// AGGREGATE_QUESTION_PATTERN since "which deals ..." would otherwise match
// AGGREGATE_QUESTION_PATTERN's plain-listing branch too — confirmed live
// this was a real bug: "which deals have no next steps recorded?" returned
// a flat "you have 3 deals: X, Y, Z" instead of actually checking each
// deal's next-steps, because the listing pattern only looks at the prefix
// ("which ... deals") and doesn't notice a filtering condition follows.
const DEAL_SYNTHESIS_PATTERN =
  /\b(need|needs|needing)\b.*\battention\b|\bat risk\b|\brisk(y|iest)?\b|\bchurn(ing)?\b|\bscore\b|\bhealth\b|\bpriorit(y|ize|ise)\b|\bstall(ed|ing)?\b|\bobjections?\b|\bnext steps?\b|\bunresolved\b|\bcompar(e|ison)\b|\bversus\b|\bvs\.?\b/i;

/**
 * Best-effort parse of a relative time phrase in a "how many calls ..."
 * question. `calls.created_at` is when the call record was UPLOADED, not a
 * verified "the call happened at" timestamp — the closest available signal,
 * not a certainty, and the answer says so explicitly rather than presenting
 * a filtered count as if it were precisely scoped to when calls occurred.
 * Returns null (meaning: don't filter, answer the plain total) when no
 * recognized time phrase is present — confirmed live this was a real gap:
 * "how many calls happened this week?" silently returned the all-time
 * total with no indication the time qualifier had been ignored.
 */
function parseRelativeTimeWindow(query: string): { label: string; since: Date } | null {
  const now = new Date();
  if (/\btoday\b/i.test(query)) {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { label: "uploaded today", since };
  }
  if (/\bthis week\b/i.test(query)) {
    const since = new Date(now);
    since.setDate(since.getDate() - since.getDay());
    since.setHours(0, 0, 0, 0);
    return { label: "uploaded this week", since };
  }
  if (/\bthis month\b/i.test(query)) {
    return { label: "uploaded this month", since: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  const lastNDays = /\blast (\d+) days?\b/i.exec(query);
  if (lastNDays?.[1]) {
    const n = Number(lastNDays[1]);
    return { label: `uploaded in the last ${n} days`, since: new Date(now.getTime() - n * 86_400_000) };
  }
  return null;
}

/**
 * The one scope-resolution function — every downstream retrieval or chat
 * call gets its transcription-id list from here, never constructed any
 * other way. Delegates ACL entirely to CallService's existing
 * requireCall/listByDeal/list (the same gates every other per-call/
 * per-deal/list route in this codebase already goes through) rather than
 * introducing a parallel access-control path.
 */
export const RetrievalService = {
  async resolveChatScope(actorId: string, scope: ChatScopeInput): Promise<ResolvedScope> {
    if (scope.scopeType === "call") {
      if (!scope.scopeCallId) throw new HttpError(400, "scopeCallId is required for scopeType 'call'");
      const call = await CallService.requireCall(actorId, scope.scopeCallId);
      const transcriptions = await TranscriptionModel.listByCallId(call.id);
      return {
        transcriptionIds: transcriptions.map((t) => t.id),
        scopeDescription: `this call ("${call.label}")`,
      };
    }

    if (scope.scopeType === "deal") {
      if (!scope.scopeDealId) throw new HttpError(400, "scopeDealId is required for scopeType 'deal'");
      const [calls, deal] = await Promise.all([
        CallService.listByDeal(actorId, scope.scopeDealId),
        DealModel.findById(scope.scopeDealId),
      ]);
      const perCall = await Promise.all(calls.map((c) => TranscriptionModel.listByCallId(c.id)));
      // The deal's real name, not just a call count — the model otherwise
      // has no legitimate way to refer to the deal by name in its answer
      // (it would have to guess or echo something from conversation
      // history instead of the actual authorized scope it was given).
      const dealLabel = deal ? `the deal "${deal.name}"` : "this deal";
      return {
        transcriptionIds: perCall.flat().map((t) => t.id),
        scopeDescription: `${dealLabel} (${calls.length} call${calls.length === 1 ? "" : "s"})`,
      };
    }

    // 'global': every call this specific user can already see —
    // CallService.list() already branches on role (owner/admin: every
    // call in the org; member: only calls they're assigned to via
    // user_deals, plus their own unassigned uploads) via the exact same
    // gate every other list endpoint in this codebase goes through. No
    // new access-control logic — "global" is a scope, not a permission.
    const allCalls = await CallService.list(actorId);

    // Focus narrows the authorized set down further, it never expands it —
    // a focusDealIds/focusCallIds entry the actor can't already see (stale
    // reference, since re-checked every turn) is silently excluded rather
    // than granting access, same posture as the carried-evidence re-auth
    // filter in chatService.
    const focusDealIds = new Set(scope.focusDealIds ?? []);
    const focusCallIds = new Set(scope.focusCallIds ?? []);
    const hasFocus = focusDealIds.size > 0 || focusCallIds.size > 0;
    const calls = hasFocus
      ? allCalls.filter((c) => (c.deal_id && focusDealIds.has(c.deal_id)) || focusCallIds.has(c.id))
      : allCalls;

    const perCall = await Promise.all(calls.map((c) => TranscriptionModel.listByCallId(c.id)));

    let scopeDescription: string;
    if (!hasFocus) {
      scopeDescription = `everything you have access to (${calls.length} call${calls.length === 1 ? "" : "s"})`;
    } else if (focusDealIds.size > 0) {
      // Same reasoning as the 'deal' branch above: name the actual deal(s),
      // don't just say "your focused selection" — real names, not a
      // hardcoded label, since that's what lets the model refer to them
      // legitimately instead of guessing from history.
      const focusedDeals = await Promise.all([...focusDealIds].map((id) => DealModel.findById(id)));
      const dealNames = focusedDeals.filter((d): d is NonNullable<typeof d> => !!d).map((d) => `"${d.name}"`);
      const dealPart = dealNames.length > 0 ? `deal${dealNames.length === 1 ? "" : "s"} ${dealNames.join(", ")}` : "your focused selection";
      scopeDescription = `${dealPart} (${calls.length} call${calls.length === 1 ? "" : "s"})`;
    } else {
      scopeDescription = `your focused selection (${calls.length} call${calls.length === 1 ? "" : "s"})`;
    }

    return {
      transcriptionIds: perCall.flat().map((t) => t.id),
      scopeDescription,
    };
  },

  /**
   * "most recent/latest/newest/last deal" — a relative reference, not a
   * name, so the name-matching regex below can never catch it. Resolved via
   * DealService.list's existing ORDER BY created_at DESC (index 0 is
   * already the most recent, no extra query needed). Confirmed live this
   * was a real gap: "how many calls in the most recent deal" fell through
   * to the generic all-deals breakdown instead of answering about a
   * specific deal, silently ignoring "most recent" entirely.
   */
  async resolveRelativeDealMention(actorId: string, query: string): Promise<DealMention | null> {
    if (!/\b(most recent|latest|newest|last)\s+deal\b/i.test(query)) return null;
    const deals = await DealService.list(actorId);
    const mostRecent = deals[0];
    return mostRecent ? { dealId: mostRecent.id, dealName: mostRecent.name } : null;
  },

  /**
   * Best-effort: does the (already contextualized) query name one of the
   * deals this actor can see? Whole-word, case-insensitive match against
   * each accessible deal's name. Deliberately conservative — only narrows
   * global scope when exactly one deal matches, since a wrong narrow
   * silently hides evidence the user might actually need, which is worse
   * than not narrowing at all. Names under 3 characters are skipped as too
   * likely to false-positive on ordinary words. Falls back to a relative
   * reference ("most recent deal") when no literal name matches.
   */
  async detectDealMention(actorId: string, query: string): Promise<DealMention | null> {
    const matches = await RetrievalService.detectDealMentions(actorId, query);
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) return RetrievalService.resolveRelativeDealMention(actorId, query);
    return null;
  },

  /**
   * Same matching as detectDealMention but returns EVERY deal named in the
   * query, not just the single-match case — needed for "compare X and Y",
   * where exactly-one-match would (correctly, for scope-narrowing purposes)
   * return null and silently fall through to nothing. Confirmed live this
   * was a real gap: "compare Land CCK and Dummy Deal" got no deal-specific
   * handling at all and fell through to a plain semantic search that found
   * nothing relevant.
   */
  async detectDealMentions(actorId: string, query: string): Promise<DealMention[]> {
    const deals = await DealService.list(actorId);
    return deals
      .filter((d) => {
        const name = d.name.trim();
        if (name.length < 3) return false;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(query);
      })
      .map((d) => ({ dealId: d.id, dealName: d.name }));
  },

  /** Same shape as the 'deal' scope branch above — used to narrow an
   * already-created 'global' conversation to a deal mentioned in one turn's
   * question, without persisting the narrowing to later turns. */
  async scopeForDeal(actorId: string, dealId: string): Promise<ResolvedScope> {
    const [calls, deal] = await Promise.all([CallService.listByDeal(actorId, dealId), DealModel.findById(dealId)]);
    const perCall = await Promise.all(calls.map((c) => TranscriptionModel.listByCallId(c.id)));
    const dealLabel = deal ? `the deal "${deal.name}"` : "this deal";
    return {
      transcriptionIds: perCall.flat().map((t) => t.id),
      scopeDescription: `${dealLabel} (${calls.length} call${calls.length === 1 ? "" : "s"})`,
    };
  },

  /**
   * Rules-first router (§7.2 of the source spec, reduced scope per the
   * plan): WHOLE_CALL and STRUCTURED_LITE only apply at call scope, since
   * both read a single call's own call_insights/topic summaries directly.
   * STRUCTURED_AGGREGATE applies at deal/global scope — a single fixed
   * call has no meaningful "how many deals" question. Everything else
   * defaults to SEMANTIC, the safe default.
   */
  route(query: string, scopeType: "call" | "deal" | "global"): { route: Route; field?: StructuredField } {
    if (scopeType !== "call" && DEAL_SYNTHESIS_PATTERN.test(query)) {
      return { route: "DEAL_SYNTHESIS" };
    }
    if (scopeType !== "call" && AGGREGATE_QUESTION_PATTERN.test(query)) {
      return { route: "STRUCTURED_AGGREGATE" };
    }
    if (scopeType === "call") {
      if (WHOLE_CALL_PATTERNS.some((p) => p.test(query))) return { route: "WHOLE_CALL" };
      const field = STRUCTURED_FIELD_PATTERNS.find(([p]) => p.test(query));
      if (field) return { route: "STRUCTURED_LITE", field: field[1] };
    }
    return { route: "SEMANTIC" };
  },

  /**
   * Deterministic answer for an aggregate/account-structure question — no
   * LLM call, no citations, same posture as STRUCTURED_LITE. Every deal is
   * currently "open" (deals have no status/stage field at all yet), so a
   * "what are the open deals" question just lists every accessible deal.
   * `scopedDealId` is passed when the CONVERSATION itself is deal-scoped
   * (not detected from the query) — it takes priority over any deal name
   * found in the query text.
   */
  async answerAggregateQuestion(actorId: string, query: string, scopedDealId?: string | null): Promise<{ answer: string }> {
    const deals = await DealService.list(actorId);

    if (/how many calls?\b/i.test(query)) {
      const window = parseRelativeTimeWindow(query);
      const targetDealId = scopedDealId ?? (await RetrievalService.detectDealMention(actorId, query))?.dealId;

      if (targetDealId) {
        const deal = deals.find((d) => d.id === targetDealId) ?? (await DealModel.findById(targetDealId));
        const callsInDeal = await CallService.listByDeal(actorId, targetDealId);
        const calls = window ? callsInDeal.filter((c) => new Date(c.created_at) >= window.since) : callsInDeal;
        const windowSuffix = window ? ` (${window.label}, out of ${callsInDeal.length} total)` : "";
        return {
          answer: `The deal "${deal?.name ?? "unknown"}" has ${calls.length} call${calls.length === 1 ? "" : "s"}${windowSuffix}.`,
        };
      }

      const allCallsUnfiltered = await CallService.list(actorId);
      const allCalls = window ? allCallsUnfiltered.filter((c) => new Date(c.created_at) >= window.since) : allCallsUnfiltered;
      const countByDeal = new Map<string, number>();
      let unassigned = 0;
      for (const c of allCalls) {
        if (c.deal_id) countByDeal.set(c.deal_id, (countByDeal.get(c.deal_id) ?? 0) + 1);
        else unassigned++;
      }
      const parts = deals.map((d) => `${d.name}: ${countByDeal.get(d.id) ?? 0}`);
      if (unassigned > 0) parts.push(`unassigned: ${unassigned}`);
      const windowSuffix = window ? ` (${window.label}, out of ${allCallsUnfiltered.length} total)` : "";
      return {
        answer:
          deals.length > 0
            ? `You have ${allCalls.length} call${allCalls.length === 1 ? "" : "s"}${windowSuffix} across ${deals.length} deal${deals.length === 1 ? "" : "s"} — ${parts.join(", ")}.`
            : `You have ${allCalls.length} call${allCalls.length === 1 ? "" : "s"}${windowSuffix}, none assigned to a deal yet.`,
      };
    }

    if (/how many deals?\b/i.test(query)) {
      return {
        answer:
          deals.length > 0
            ? `You have ${deals.length} deal${deals.length === 1 ? "" : "s"}: ${deals.map((d) => d.name).join(", ")}.`
            : "You don't have any deals yet.",
      };
    }

    // "what/which/list ... deals" and "open deals" — all deals qualify as
    // open today, so this is just the full accessible list.
    return {
      answer:
        deals.length > 0
          ? `You have ${deals.length} deal${deals.length === 1 ? "" : "s"}: ${deals.map((d) => d.name).join(", ")}.`
          : "You don't have any deals yet.",
    };
  },

  /**
   * Ground-truth deal/call directory, always injected as part of the
   * structured record for global/deal-scope chat turns — not conditional on
   * matching AGGREGATE_QUESTION_PATTERN. The regex router is necessarily
   * incomplete (it can only catch phrasings someone thought to write a
   * pattern for), so this is the fallback: even when a question's phrasing
   * doesn't trip STRUCTURED_AGGREGATE, the model still has real deal names
   * and call counts in front of it for the SEMANTIC path to reason from,
   * instead of only being able to answer structural questions it happens to
   * pattern-match. Cheap (two already-ACL'd list calls, no embeddings).
   */
  async buildAccountDirectory(actorId: string): Promise<string> {
    const [deals, calls] = await Promise.all([DealService.list(actorId), CallService.list(actorId)]);
    if (deals.length === 0) return "Deals: none yet.";
    const countByDeal = new Map<string, number>();
    let unassigned = 0;
    for (const c of calls) {
      if (c.deal_id) countByDeal.set(c.deal_id, (countByDeal.get(c.deal_id) ?? 0) + 1);
      else unassigned++;
    }
    const lines = deals.map((d) => `- ${d.name}: ${countByDeal.get(d.id) ?? 0} call${(countByDeal.get(d.id) ?? 0) === 1 ? "" : "s"}`);
    if (unassigned > 0) lines.push(`- (unassigned calls): ${unassigned}`);
    return `Deals (${deals.length} total, ${calls.length} call${calls.length === 1 ? "" : "s"} overall):\n${lines.join("\n")}`;
  },

  /**
   * One deal's calls rendered as evidence for DEAL_SYNTHESIS — every call's
   * objections and next-steps in full (the only two factors the synthesis
   * prompt is told it may use), plus the summary for read-through context.
   * A call with no insights yet (still processing, or insights generation
   * failed) is rendered as an explicit gap rather than silently skipped —
   * "no data yet" is itself relevant to a risk/attention judgment.
   */
  async buildDealRollup(actorId: string, dealId: string): Promise<DealBlock | null> {
    const deal = await DealModel.findById(dealId);
    if (!deal) return null;
    const calls = await CallService.listByDeal(actorId, dealId);
    const insights = await CallInsightModel.listByCallIds(calls.map((c) => c.id));
    const insightByCallId = new Map(insights.map((i) => [i.call_id, i]));

    const sections = calls.map((c) => {
      const insight = insightByCallId.get(c.id);
      if (!insight || insight.status !== "SUCCESS") {
        return `Call "${c.label}": no insights available yet.`;
      }
      const parts = [`Call "${c.label}":`];
      parts.push(
        "Summary:",
        insight.summary.length > 0 ? insight.summary.map((s) => `- ${s.title}: ${s.text}`).join("\n") : "- (none recorded)",
      );
      parts.push(
        "Objections:",
        insight.objections.length > 0 ? insight.objections.map((o) => `- ${o.title}: ${o.text}`).join("\n") : "- none recorded",
      );
      parts.push(
        "Next steps:",
        insight.next_steps.length > 0 ? insight.next_steps.map((n) => `- ${n.text} (${n.owner})`).join("\n") : "- none recorded",
      );
      return parts.join("\n");
    });

    return {
      dealId,
      dealName: deal.name,
      text: sections.join("\n\n") || "No calls recorded for this deal yet.",
    };
  },

  /**
   * Resolves which deal(s) a DEAL_SYNTHESIS turn should reason over: the
   * conversation's own deal if it's deal-scoped, else a deal named in the
   * query text, else every deal the actor can see (for a portfolio-wide
   * question like "which deal needs attention"). Capped at 20 deals for the
   * portfolio-wide case — a real, flagged limit (not silently truncated;
   * the caller surfaces how many were actually covered), not a scale this
   * v1 pass is built for.
   */
  async resolveDealsForSynthesis(actorId: string, query: string, scopedDealId?: string | null): Promise<DealBlock[]> {
    if (scopedDealId) {
      const single = await RetrievalService.buildDealRollup(actorId, scopedDealId);
      return single ? [single] : [];
    }
    // ALL named deals, not just the single-match case — "compare X and Y"
    // names two deals on purpose, and both need their own rollup so the
    // model can actually compare them rather than reasoning over just one.
    const mentions = await RetrievalService.detectDealMentions(actorId, query);
    if (mentions.length > 0) {
      const rollups = await Promise.all(mentions.map((m) => RetrievalService.buildDealRollup(actorId, m.dealId)));
      return rollups.filter((r): r is DealBlock => !!r);
    }
    // "score for the most recent deal" — same relative-reference case as
    // the aggregate path, checked before falling back to every deal.
    const relative = await RetrievalService.resolveRelativeDealMention(actorId, query);
    if (relative) {
      const single = await RetrievalService.buildDealRollup(actorId, relative.dealId);
      return single ? [single] : [];
    }
    const deals = await DealService.list(actorId);
    const capped = deals.slice(0, 20);
    const rollups = await Promise.all(capped.map((d) => RetrievalService.buildDealRollup(actorId, d.id)));
    return rollups.filter((r): r is DealBlock => !!r);
  },

  async hybridSearch(transcriptionIds: string[], queryText: string) {
    if (transcriptionIds.length === 0) return [];
    const client = getEmbeddingClient();
    const [queryEmbedding] = await client.embed([queryText], "query");
    if (!queryEmbedding) return [];
    return ChunkModel.hybridSearch(transcriptionIds, queryEmbedding, queryText, 30);
  },

  /**
   * Bounded expansion (§7.5): topic summary + matched chunk + up to 2
   * neighbouring turns on each side, deduped by topic BEFORE this runs (a
   * hit list can't legally contain two chunks from the same topic here —
   * see the dedupe below). `shownText` is exactly what gets assembled into
   * the prompt, and it's the ONLY thing the chat evidence gate is allowed
   * to validate a citation's quote against (see the plan's "Reliability
   * requirements" — never re-derived from the original segment's full
   * text, since that's what let a split-turn citation validate against
   * text the model never saw).
   */
  async expandBoundedBlocks(hits: (ChunkRecord & { rrf: number })[], limit = 6): Promise<BoundedBlock[]> {
    const deduped: (ChunkRecord & { rrf: number })[] = [];
    const seenTopicKeys = new Set<string>();
    for (const hit of hits) {
      const key = hit.topic_segment_id ?? `chunk:${hit.id}`;
      if (seenTopicKeys.has(key)) continue;
      seenTopicKeys.add(key);
      deduped.push(hit);
      if (deduped.length >= limit) break;
    }

    const topicIds = [...new Set(deduped.map((h) => h.topic_segment_id).filter((id): id is string => !!id))];
    const topics = await TopicSegmentModel.findByIds(topicIds);
    const topicById = new Map(topics.map((t) => [t.id, t]));

    const transcriptionIds = [...new Set(deduped.map((h) => h.transcription_id))];
    const callTranscripts = await Promise.all(
      transcriptionIds.map((id) => CallTranscriptModel.findByTranscriptionId(id)),
    );
    const segmentsByTranscriptionId = new Map(
      callTranscripts.filter((ct) => !!ct).map((ct) => [ct!.transcription_id, ct!.segments]),
    );

    return deduped.map((hit) => {
      const topic = hit.topic_segment_id ? topicById.get(hit.topic_segment_id) : undefined;
      const segments = segmentsByTranscriptionId.get(hit.transcription_id) ?? [];
      const idxById = new Map(segments.map((s, i) => [s.id, i]));
      const positions = hit.segment_ids.map((id) => idxById.get(id)).filter((i): i is number => i !== undefined);

      // Rendered fresh from `segments` with each turn's real segment id
      // inline — NOT the embedded chunk.body, which deliberately omits ids
      // (like the source spec omits timestamps: they'd add tokens and
      // pollute the embedding vector for no similarity benefit). Chat
      // generation needs the opposite: the model can only cite a real
      // segmentId if it's actually shown one, exactly why
      // callInsights.ts's renderTranscriptBlock puts `[segment.id]` inline
      // for its own citations. Skipping this step is what let a citation's
      // segmentId come back as a hallucinated guess (the speaker label)
      // the first time this was tested live.
      const renderTurn = (s: (typeof segments)[number]) => `[${s.id}] ${s.speaker ?? "speaker"}: ${s.text}`;

      let before = "";
      let core = "";
      let after = "";
      // The FULL set of segment ids actually rendered into shownText —
      // before + core + after — not just hit.segment_ids (the chunk's own
      // DB column). Confirmed live: a citation to a neighbour turn that
      // WAS genuinely shown (e.g. the "before" expansion) was getting
      // wrongly rejected by the gate as "doesn't belong to this chunk"
      // because this used to be hit.segment_ids only. The gate must
      // validate against exactly what was shown — that cuts both ways:
      // rejecting a citation to something never shown, but also NOT
      // rejecting a citation to something that genuinely was.
      let renderedSegmentIds: string[] = hit.segment_ids;
      if (positions.length > 0) {
        const minIdx = Math.min(...positions);
        const maxIdx = Math.max(...positions);
        const start = Math.max(0, minIdx - 2);
        const end = Math.min(segments.length - 1, maxIdx + 2);
        const beforeSegments = segments.slice(start, minIdx);
        const coreSegments = segments.slice(minIdx, maxIdx + 1);
        const afterSegments = segments.slice(maxIdx + 1, end + 1);
        before = beforeSegments.map(renderTurn).join("\n");
        core = coreSegments.map(renderTurn).join("\n");
        after = afterSegments.map(renderTurn).join("\n");
        renderedSegmentIds = [...beforeSegments, ...coreSegments, ...afterSegments].map((s) => s.id);
      } else {
        // Segments not resolvable by id (shouldn't normally happen) —
        // fall back to the chunk's own body so the block isn't empty.
        core = hit.body;
      }

      const parts = [
        topic ? `Topic: ${topic.label}\nSummary: ${topic.summary}` : null,
        before || null,
        core,
        after || null,
      ].filter((p): p is string => !!p);

      return {
        chunkId: hit.id,
        transcriptionId: hit.transcription_id,
        callId: hit.call_id,
        segmentIds: renderedSegmentIds,
        shownText: parts.join("\n\n"),
        attributionUncertain: hit.attribution_uncertain,
      };
    });
  },
};
