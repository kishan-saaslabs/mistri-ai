import {
  contextualizeQuery,
  generateChatAnswer,
  getChatLLMClient,
  tokenCount,
  validateCitations,
  type ChatCitation,
  type ChatTurn,
} from "@mistri-ai/ai";
import { CallInsightModel } from "../models/callInsightModel.js";
import { ChunkModel } from "../models/chunkModel.js";
import { ConversationModel, type ChatScopeType } from "../models/conversationModel.js";
import { MessageModel } from "../models/messageModel.js";
import { TopicSegmentModel } from "../models/topicSegmentModel.js";
import { UserModel } from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";
import { RetrievalService, type BoundedBlock } from "./retrievalService.js";

// Concrete v1 budget table (see the plan's "Reliability requirements" —
// the ordering is the actual policy; these numbers are a starting point
// to tune against real calls, not load-bearing precision).
const BUDGET = {
  structuredRecordTokens: 2000,
  currentEvidenceTokens: 3000,
  carriedEvidenceTokens: 1500,
  historyTokens: 2000,
} as const;

const HISTORY_TURNS_CONSIDERED = 6;

type EvidenceBlockWithMeta = {
  chunkId: string;
  transcriptionId: string;
  segmentIds: string[];
  text: string;
  attributionUncertain: boolean;
};

function truncateToTokenBudget(text: string, budget: number): string {
  if (tokenCount(text) <= budget) return text;
  // Cheap truncation: cut in half repeatedly until under budget rather
  // than re-tokenizing char-by-char — good enough for a "never fully
  // dropped, just capped" slot.
  let candidate = text;
  while (tokenCount(candidate) > budget && candidate.length > 0) {
    candidate = candidate.slice(0, Math.floor(candidate.length * 0.9));
  }
  return `${candidate}…`;
}

function fitBlocksToBudget(blocks: EvidenceBlockWithMeta[], budget: number): EvidenceBlockWithMeta[] {
  const kept: EvidenceBlockWithMeta[] = [];
  let used = 0;
  for (const block of blocks) {
    const t = tokenCount(block.text);
    if (used + t > budget && kept.length > 0) break;
    kept.push(block);
    used += t;
  }
  return kept;
}

function renderHistory(turns: ChatTurn[], budget: number): { text: string; keptCount: number; droppedCount: number } {
  // Oldest-first drop: start from the most recent turns and add older ones
  // while there's room, so what's dropped is always the oldest.
  const reversed = [...turns].reverse();
  const kept: ChatTurn[] = [];
  let used = 0;
  for (const turn of reversed) {
    const t = tokenCount(turn.content);
    if (used + t > budget) break;
    kept.unshift(turn);
    used += t;
  }
  return {
    text: kept.map((t) => `${t.role}: ${t.content}`).join("\n"),
    keptCount: kept.length,
    droppedCount: turns.length - kept.length,
  };
}

function formatInsightsAsStructuredRecord(insights: {
  summary: { title: string; text: string }[];
  objections: { title: string; text: string }[];
  customer_wants: { label: string }[];
  next_steps: { text: string; owner: string }[];
}): string {
  const parts: string[] = [];
  if (insights.summary.length > 0) {
    parts.push("Summary:", ...insights.summary.map((s) => `- ${s.title}: ${s.text}`));
  }
  if (insights.objections.length > 0) {
    parts.push("Objections:", ...insights.objections.map((o) => `- ${o.title}: ${o.text}`));
  }
  if (insights.customer_wants.length > 0) {
    parts.push("Customer wants:", ...insights.customer_wants.map((c) => `- ${c.label}`));
  }
  if (insights.next_steps.length > 0) {
    parts.push("Next steps:", ...insights.next_steps.map((n) => `- ${n.text} (${n.owner})`));
  }
  return parts.join("\n");
}

function formatStructuredLiteAnswer(
  field: "objections" | "nextSteps" | "outcome" | "summary" | "customerWants",
  insights: Awaited<ReturnType<typeof CallInsightModel.findByTranscriptionId>>,
): { answer: string; citations: ChatCitation[] } {
  if (!insights || insights.status !== "SUCCESS") {
    return { answer: "Insights for this call aren't available yet.", citations: [] };
  }

  const toCitations = (items: { evidence: { segmentId: string; quote: string }[] }[]): ChatCitation[] =>
    items.flatMap((item) =>
      item.evidence.map((e) => ({ segmentId: e.segmentId, chunkId: `insight:${insights.transcription_id}`, quote: e.quote })),
    );

  switch (field) {
    case "objections":
      if (insights.objections.length === 0) return { answer: "No objections were recorded for this call.", citations: [] };
      return {
        answer: insights.objections.map((o) => `${o.title}: ${o.text}`).join("\n"),
        citations: toCitations(insights.objections),
      };
    case "nextSteps":
      if (insights.next_steps.length === 0) return { answer: "No next steps were recorded for this call.", citations: [] };
      return {
        answer: insights.next_steps.map((n) => `${n.text} — ${n.owner}`).join("\n"),
        citations: toCitations(insights.next_steps),
      };
    case "customerWants":
      if (insights.customer_wants.length === 0) return { answer: "No customer wants were recorded for this call.", citations: [] };
      return {
        answer: insights.customer_wants.map((c) => c.label).join("\n"),
        citations: toCitations(insights.customer_wants),
      };
    case "summary":
    case "outcome":
    default:
      if (insights.summary.length === 0) return { answer: "No summary is available for this call.", citations: [] };
      return {
        answer: insights.summary.map((s) => `${s.title}: ${s.text}`).join("\n"),
        citations: toCitations(insights.summary),
      };
  }
}

export const ChatService = {
  async createConversation(
    actorId: string,
    input: { scopeType: ChatScopeType; scopeCallId?: string; scopeDealId?: string },
  ) {
    const scope = await RetrievalService.resolveChatScope(actorId, input);
    const actor = await UserModel.findById(actorId);
    if (!actor) throw new HttpError(401, "Authentication required");
    const conversation = await ConversationModel.create({
      organizationId: actor.organization_id,
      userId: actorId,
      scopeType: input.scopeType,
      scopeCallId: input.scopeType === "call" ? (input.scopeCallId ?? null) : null,
      scopeDealId: input.scopeType === "deal" ? (input.scopeDealId ?? null) : null,
    });
    if (!conversation) throw new HttpError(500, "Could not create conversation", false);
    return {
      conversationId: conversation.id,
      effectiveTranscriptCount: scope.transcriptionIds.length,
      scopeDescription: scope.scopeDescription,
    };
  },

  listMessages(conversationId: string) {
    return MessageModel.listByConversationId(conversationId);
  },

  async postMessage(actorId: string, conversationId: string, content: string) {
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation || conversation.user_id !== actorId) {
      throw new HttpError(404, "Conversation not found");
    }

    // Re-resolves scope (and therefore re-checks ACL) on EVERY turn, never
    // cached from conversation creation — a transcript transferred or
    // unassigned since this conversation started must stop being
    // accessible immediately, not just for new conversations.
    const scope = await RetrievalService.resolveChatScope(actorId, {
      scopeType: conversation.scope_type,
      scopeCallId: conversation.scope_call_id ?? undefined,
      scopeDealId: conversation.scope_deal_id ?? undefined,
    });

    const priorMessages = await MessageModel.listByConversationId(conversationId);
    const history: ChatTurn[] = priorMessages
      .slice(-HISTORY_TURNS_CONSIDERED)
      .map((m) => ({ role: m.role, content: m.content }));

    const chatClient = getChatLLMClient();
    const { standaloneQuery, isFollowup } = await contextualizeQuery(history, content, chatClient);

    if (scope.transcriptionIds.length === 0) {
      const answer = `I don't have any processed calls in ${scope.scopeDescription} to answer from yet.`;
      await MessageModel.insertUserMessage({
        conversationId,
        content,
        originalQuery: content,
        rewrittenQuery: isFollowup ? standaloneQuery : null,
      });
      const saved = await MessageModel.insertAssistantMessage({
        conversationId,
        content: answer,
        citations: [],
        contextStats: { route: "SEMANTIC", reason: "empty_scope" },
      });
      return saved;
    }

    const { route, field } = RetrievalService.route(standaloneQuery, conversation.scope_type);

    await MessageModel.insertUserMessage({
      conversationId,
      content,
      originalQuery: content,
      rewrittenQuery: isFollowup ? standaloneQuery : null,
    });

    // STRUCTURED_LITE: deterministic, no LLM call at all — the call-scope
    // analogue of the source spec's L6 (aggregate/named-field questions
    // answered by structured data, never top-k retrieval).
    if (route === "STRUCTURED_LITE" && field) {
      const transcriptionId = scope.transcriptionIds[0];
      const insights = transcriptionId ? await CallInsightModel.findByTranscriptionId(transcriptionId) : null;
      const { answer, citations } = formatStructuredLiteAnswer(field, insights);
      await ConversationModel.updateAfterTurn(conversationId, []);
      return MessageModel.insertAssistantMessage({
        conversationId,
        content: answer,
        citations,
        contextStats: { route, field },
      });
    }

    let structuredRecordText = "";
    let currentEvidenceBlocks: EvidenceBlockWithMeta[] = [];

    if (route === "WHOLE_CALL") {
      const transcriptionId = scope.transcriptionIds[0];
      const [insights, topics] = await Promise.all([
        transcriptionId ? CallInsightModel.findByTranscriptionId(transcriptionId) : Promise.resolve(null),
        transcriptionId ? TopicSegmentModel.listByTranscriptionId(transcriptionId) : Promise.resolve([]),
      ]);
      if (insights?.status === "SUCCESS") structuredRecordText = formatInsightsAsStructuredRecord(insights);
      // Whole-call mode reads topic summaries directly, never L2 chunks —
      // per the spec, retrieval would hand back a handful of 200-token
      // chunks and call that a summary, which is exactly wrong here.
      // Cited chunkId is synthetic (`topic:<id>`) rather than a real
      // `chunks` row id — the topic_segments row is the source of truth
      // for whole-call synthesis, and the gate validates the model's
      // quote against this exact text either way, so the synthetic id is
      // internally consistent even though it won't resolve against the
      // chunks table for a future "open this citation" UI action.
      currentEvidenceBlocks = topics.map((t) => ({
        chunkId: `topic:${t.id}`,
        transcriptionId: t.transcription_id,
        segmentIds: t.segment_ids,
        text: `Topic: ${t.label}\nSummary: ${t.summary}`,
        attributionUncertain: t.attribution_uncertain,
      }));
    } else {
      const transcriptionIdForRecord = conversation.scope_type === "call" ? scope.transcriptionIds[0] : undefined;
      if (transcriptionIdForRecord) {
        const insights = await CallInsightModel.findByTranscriptionId(transcriptionIdForRecord);
        if (insights?.status === "SUCCESS") structuredRecordText = formatInsightsAsStructuredRecord(insights);
      }

      const hits = await RetrievalService.hybridSearch(scope.transcriptionIds, standaloneQuery);
      const blocks: BoundedBlock[] = await RetrievalService.expandBoundedBlocks(hits);
      currentEvidenceBlocks = blocks.map((b) => ({
        chunkId: b.chunkId,
        transcriptionId: b.transcriptionId,
        segmentIds: b.segmentIds,
        text: b.shownText,
        attributionUncertain: b.attributionUncertain,
      }));
    }

    // Carried evidence from prior turns, RE-AUTHORIZED this turn: only
    // kept if its transcriptionId is still in the freshly resolved scope
    // — not cached, not trusted from the prior turn's resolution. The
    // chunk body itself is re-fetched fresh from `chunks` rather than
    // stored in `conversations.carried_evidence` (which holds only the
    // lightweight pointer: chunkId/transcriptionId/segmentIds) — a chunk
    // row's body is immutable once ingested, so this is always exactly
    // as current as re-ingestion would make it, with no separate cache to
    // go stale. Note this re-shows the bare chunk body, not the original
    // turn's full bounded-expansion block (topic header + neighbour
    // turns) — a reasonable v1 simplification.
    const authorizedTranscriptionIds = new Set(scope.transcriptionIds);
    const carriedPointers = (conversation.carried_evidence ?? []).filter((c) =>
      authorizedTranscriptionIds.has(c.transcriptionId),
    );
    const carriedChunks = await ChunkModel.findByIds(carriedPointers.map((c) => c.chunkId));
    const carriedEvidenceBlocks: EvidenceBlockWithMeta[] = carriedChunks.map((c) => ({
      chunkId: c.id,
      transcriptionId: c.transcription_id,
      segmentIds: c.segment_ids,
      text: c.body,
      attributionUncertain: c.attribution_uncertain,
    }));

    const fittedCurrentEvidence = fitBlocksToBudget(currentEvidenceBlocks, BUDGET.currentEvidenceTokens);
    const fittedCarriedEvidence = fitBlocksToBudget(carriedEvidenceBlocks, BUDGET.carriedEvidenceTokens);
    const fittedStructuredRecord = truncateToTokenBudget(structuredRecordText, BUDGET.structuredRecordTokens);
    const { text: historyText, keptCount, droppedCount } = renderHistory(history, BUDGET.historyTokens);

    const allEvidenceBlocks = [...fittedCurrentEvidence, ...fittedCarriedEvidence];

    const answer = await generateChatAnswer(
      {
        scopeDescription: scope.scopeDescription,
        structuredRecordText: fittedStructuredRecord,
        evidenceBlocks: allEvidenceBlocks.map((b) => ({ chunkId: b.chunkId, text: b.text })),
        historyText,
        question: standaloneQuery,
      },
      chatClient,
    );

    const shownContextByChunkId = new Map(
      allEvidenceBlocks.map((b) => [
        b.chunkId,
        { shownText: b.text, segmentIds: b.segmentIds, attributionUncertain: b.attributionUncertain },
      ]),
    );
    const { validCitations, droppedCount: droppedCitations, anyAttributionUncertain } = validateCitations(
      answer.citations,
      shownContextByChunkId,
    );

    // Only real `chunks` table rows can be carried forward — WHOLE_CALL's
    // evidence blocks use synthetic chunkIds (`topic:<uuid>`) that aren't
    // valid chunk ids, and ChunkModel.findByIds's `= ANY($1::uuid[])` cast
    // throws on the next turn if one of those leaks in here. Confirmed
    // live: this crashed the very next turn before this filter existed.
    const isRealChunkId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const nextCarriedEvidence = fittedCurrentEvidence
      .filter((b) => isRealChunkId.test(b.chunkId))
      .map((b) => ({
        chunkId: b.chunkId,
        transcriptionId: b.transcriptionId,
        segmentIds: b.segmentIds,
      }));
    await ConversationModel.updateAfterTurn(conversationId, nextCarriedEvidence);

    const finalAnswer =
      anyAttributionUncertain && validCitations.length > 0
        ? `${answer.answer}\n\n(Note: this answer draws on a segment where speaker identification was uncertain.)`
        : answer.answer;

    return MessageModel.insertAssistantMessage({
      conversationId,
      content: finalAnswer,
      citations: validCitations,
      contextStats: {
        route,
        historyTurnsKept: keptCount,
        historyTurnsDropped: droppedCount,
        evidenceBlocksUsed: fittedCurrentEvidence.length,
        carriedEvidenceUsed: fittedCarriedEvidence.length,
        citationsDropped: droppedCitations,
        attributionUncertain: anyAttributionUncertain,
      },
    });
  },
};
