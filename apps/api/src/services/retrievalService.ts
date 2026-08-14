import { getEmbeddingClient } from "@mistri-ai/ai";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";
import { ChunkModel, type ChunkRecord } from "../models/chunkModel.js";
import { TopicSegmentModel } from "../models/topicSegmentModel.js";
import { TranscriptionModel } from "../models/transcriptionModel.js";
import { HttpError } from "../utils/httpError.js";
import { CallService } from "./callService.js";

export type ChatScopeInput = {
  scopeType: "call" | "deal";
  scopeCallId?: string;
  scopeDealId?: string;
};

export type ResolvedScope = {
  transcriptionIds: string[];
  scopeDescription: string;
};

export type Route = "SEMANTIC" | "WHOLE_CALL" | "STRUCTURED_LITE";

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

/**
 * The one scope-resolution function — every downstream retrieval or chat
 * call gets its transcription-id list from here, never constructed any
 * other way. Delegates ACL entirely to CallService's existing
 * requireCall/listByDeal (the same gates every other per-call/per-deal
 * route in this codebase already goes through) rather than introducing a
 * parallel access-control path.
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

    if (!scope.scopeDealId) throw new HttpError(400, "scopeDealId is required for scopeType 'deal'");
    const calls = await CallService.listByDeal(actorId, scope.scopeDealId);
    const perCall = await Promise.all(calls.map((c) => TranscriptionModel.listByCallId(c.id)));
    return {
      transcriptionIds: perCall.flat().map((t) => t.id),
      scopeDescription: `this deal (${calls.length} call${calls.length === 1 ? "" : "s"})`,
    };
  },

  /**
   * Rules-first router (§7.2 of the source spec, reduced scope per the
   * plan): WHOLE_CALL and STRUCTURED_LITE only apply at call scope, since
   * both read a single call's own call_insights/topic summaries directly.
   * Everything else — including anything unmatched — defaults to
   * SEMANTIC, the safe default.
   */
  route(query: string, scopeType: "call" | "deal"): { route: Route; field?: StructuredField } {
    if (scopeType === "call") {
      if (WHOLE_CALL_PATTERNS.some((p) => p.test(query))) return { route: "WHOLE_CALL" };
      const field = STRUCTURED_FIELD_PATTERNS.find(([p]) => p.test(query));
      if (field) return { route: "STRUCTURED_LITE", field: field[1] };
    }
    return { route: "SEMANTIC" };
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
