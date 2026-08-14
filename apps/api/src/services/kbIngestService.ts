import { createHash } from "node:crypto";
import {
  buildTopicLabelPrompt,
  constrainTopics,
  detectCandidateBoundaries,
  getEmbeddingClient,
  getInsightsLLMClient,
  isAttributionUncertain,
  parseTopicLabels,
  tokenCount,
  windowTranscript,
  type Chunk,
} from "@mistri-ai/ai";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";
import { ChunkEmbeddingModel } from "../models/chunkEmbeddingModel.js";
import { ChunkModel } from "../models/chunkModel.js";
import { TopicSegmentModel } from "../models/topicSegmentModel.js";

const EMBEDDING_BATCH = 96;

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

async function embedAll(bodies: string[]): Promise<number[][]> {
  if (bodies.length === 0) return [];
  const client = getEmbeddingClient();
  const results: number[][] = [];
  for (let i = 0; i < bodies.length; i += EMBEDDING_BATCH) {
    const batch = bodies.slice(i, i + EMBEDDING_BATCH);
    const embedded = await client.embed(batch, "document");
    results.push(...embedded);
  }
  return results;
}

function renderTopicSummaryBody(label: string, summary: string): string {
  return `Topic: ${label}\n\nSummary: ${summary}`;
}

/**
 * Chunks a named transcript into L2 turn windows, embeds them, segments
 * them into L1.5 topics (reusing the L2 embeddings for the semantic
 * boundary signal), and emits one embedded topic-summary chunk per topic
 * — the full ingestion pipeline from the plan, run once per transcription
 * right after speaker-name inference succeeds. Idempotent: re-running
 * fully replaces this transcription's chunks/topic_segments rather than
 * appending, so a retry after a crash never duplicates.
 */
export const KbIngestService = {
  async ingestForTranscription(transcriptionId: string): Promise<void> {
    const callTranscript = await CallTranscriptModel.findByTranscriptionId(transcriptionId);
    if (!callTranscript) {
      throw new Error(
        `No call_transcripts row for transcription ${transcriptionId} — speaker-name inference must succeed before KB ingestion can run`,
      );
    }

    await CallTranscriptModel.markKbProcessing(transcriptionId);

    try {
      const transcript = callTranscript.segments;
      const l2Chunks = windowTranscript(transcript);

      if (l2Chunks.length === 0) {
        await TopicSegmentModel.replaceForTranscription(callTranscript.call_id, transcriptionId, []);
        await ChunkModel.replaceForTranscription(callTranscript.call_id, transcriptionId, []);
        await CallTranscriptModel.markKbSuccess(transcriptionId);
        return;
      }

      const l2Embeddings = await embedAll(l2Chunks.map((c) => c.body));

      const candidateSignals = detectCandidateBoundaries(l2Chunks, l2Embeddings, transcript);
      const topicGroups = constrainTopics(l2Chunks, l2Embeddings, candidateSignals);

      // Topic labeling reuses the insights LLM profile: it's async,
      // worker-triggered analysis work, the same nature as call-insights
      // generation, not an interactive call site that would justify its
      // own connection profile.
      const labelClient = getInsightsLLMClient();
      const labelPrompt = buildTopicLabelPrompt(topicGroups, l2Chunks, transcript);
      let labelsRaw = await labelClient.complete(labelPrompt, { jsonMode: true, temperature: 0 });
      let labels = parseTopicLabels(labelsRaw, topicGroups.length);
      if (!labels) {
        labelsRaw = await labelClient.complete(
          [
            ...labelPrompt,
            {
              role: "user" as const,
              content: `Return ONLY a JSON array of exactly ${topicGroups.length} entries, one per segment, in order. No prose, no markdown fences.`,
            },
          ],
          { jsonMode: true, temperature: 0 },
        );
        labels = parseTopicLabels(labelsRaw, topicGroups.length);
      }
      // Labels/summaries are narration, not evidence-bearing claims (L8) —
      // a positional fallback here is safe in a way it wouldn't be for
      // call insights, which throws instead.
      const finalLabels =
        labels ?? topicGroups.map((_, seq) => ({ seq, label: `Segment ${seq + 1}`, summary: "" }));

      // Each L2 chunk's `seq` IS its index into l2Chunks (windowTranscript
      // assigns seq sequentially as chunks are pushed, with no gaps or
      // reordering), so group.chunkIndices — indices into l2Chunks — double
      // as the set of L2 seqs that belong to this topic group. Recorded
      // directly here rather than re-derived later.
      const topicSeqByL2Seq = new Map<number, number>();

      const topicSummaryChunks: Chunk[] = [];
      const topicInputs = topicGroups.map((group, seq) => {
        for (const l2Seq of group.chunkIndices) topicSeqByL2Seq.set(l2Seq, seq);

        const segmentIds = group.chunkIndices.flatMap((i) => l2Chunks[i]!.segmentIds);
        // The L2 tier's own token total (topic_segments.token_count), NOT
        // the topic-summary chunk body's token count computed below —
        // deliberately named differently from the imported tokenCount()
        // to avoid shadowing it.
        const l2TokenTotal = group.chunkIndices.reduce((sum, i) => sum + l2Chunks[i]!.tokenCount, 0);
        const found = finalLabels.find((l) => l.seq === seq);
        const label = found?.label ?? `Segment ${seq + 1}`;
        const summary = found?.summary ?? "";
        const attributionUncertain = isAttributionUncertain(segmentIds, transcript, callTranscript.inferred_speakers);

        const body = renderTopicSummaryBody(label, summary);
        topicSummaryChunks.push({
          tier: "topic_summary",
          seq,
          body,
          segmentIds,
          anchorSegmentId: segmentIds[0] ?? null,
          tokenCount: tokenCount(body),
          attributionUncertain,
        });

        return {
          seq,
          label,
          summary,
          segmentIds,
          tokenCount: l2TokenTotal,
          boundarySignals: group.boundarySignals,
          attributionUncertain,
        };
      });

      const topicSummaryEmbeddings = await embedAll(topicSummaryChunks.map((c) => c.body));

      // Tag each L2 chunk's attribution_uncertain from the same speaker-
      // confidence join used for topics — propagating the signal this
      // session found was previously being discarded after speaker naming.
      const taggedL2Chunks = l2Chunks.map((c) => ({
        ...c,
        attributionUncertain: isAttributionUncertain(c.segmentIds, transcript, callTranscript.inferred_speakers),
      }));

      const savedTopics = await TopicSegmentModel.replaceForTranscription(
        callTranscript.call_id,
        transcriptionId,
        topicInputs,
      );
      const topicIdBySeq = new Map(savedTopics.map((t) => [t.seq, t.id]));

      const chunkRows = [
        ...taggedL2Chunks.map((c) => ({
          topicSegmentId: (() => {
            const topicSeq = topicSeqByL2Seq.get(c.seq);
            return topicSeq !== undefined ? (topicIdBySeq.get(topicSeq) ?? null) : null;
          })(),
          tier: c.tier,
          seq: c.seq,
          body: c.body,
          bodyHash: bodyHash(c.body),
          segmentIds: c.segmentIds,
          anchorSegmentId: c.anchorSegmentId,
          tokenCount: c.tokenCount,
          attributionUncertain: c.attributionUncertain,
        })),
        ...topicSummaryChunks.map((c) => ({
          topicSegmentId: topicIdBySeq.get(c.seq) ?? null,
          tier: c.tier,
          seq: c.seq,
          body: c.body,
          bodyHash: bodyHash(c.body),
          segmentIds: c.segmentIds,
          anchorSegmentId: c.anchorSegmentId,
          tokenCount: c.tokenCount,
          attributionUncertain: c.attributionUncertain,
        })),
      ];

      const savedChunks = await ChunkModel.replaceForTranscription(
        callTranscript.call_id,
        transcriptionId,
        chunkRows,
      );

      const embeddingModel = "kb-v1"; // logged label only; see llmConfig.modelEmbedding for the actual provider model
      const embeddingRows = [
        ...taggedL2Chunks.map((c, i) => ({ chunkKey: `turn_window:${c.seq}`, embedding: l2Embeddings[i]! })),
        ...topicSummaryChunks.map((c, i) => ({
          chunkKey: `topic_summary:${c.seq}`,
          embedding: topicSummaryEmbeddings[i]!,
        })),
      ];
      const chunkIdByKey = new Map(savedChunks.map((c) => [`${c.tier}:${c.seq}`, c.id]));

      await ChunkEmbeddingModel.upsertMany(
        embeddingRows
          .map((r) => ({ chunkId: chunkIdByKey.get(r.chunkKey), model: embeddingModel, embedding: r.embedding }))
          .filter((r): r is { chunkId: string; model: string; embedding: number[] } => !!r.chunkId),
      );

      await CallTranscriptModel.markKbSuccess(transcriptionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "KB ingestion failed";
      await CallTranscriptModel.markKbFailed(transcriptionId, message);
      throw error;
    }
  },
};
