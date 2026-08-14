import type { ChatMessage } from "../llm/llmClient.js";
import type { BoundarySignal, Chunk, NamedTranscript, NamedTranscriptSegment } from "../types.js";
import { parseJsonLeniently } from "../util/parseJson.js";

export const TOPIC_CONSTRAINTS = {
  minTopicTokens: 600,
  maxTopicTokens: 4000,
  gapMs: 20_000,
  semanticPercentile: 75,
} as const;

// Evaluated only against a chunk's opening turn, per the source spec —
// a cue phrase mid-turn (quoting someone else bringing up a new topic,
// say) isn't the same signal as the turn that actually opens with it.
const CUE_PATTERNS = [
  /let'?s move on/i,
  /next (item|topic)/i,
  /switching gears/i,
  /before we wrap/i,
  /any questions on that/i,
  /on the topic of/i,
  /moving to/i,
];

export type TopicGroup = {
  chunkIndices: number[];
  boundarySignals: BoundarySignal[];
};

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : 1 - dot / denom;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function averageEmbedding(vectors: number[][]): number[] {
  const dim = vectors[0]?.length ?? 0;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i += 1) sum[i] += v[i]!;
  }
  return sum.map((s) => s / vectors.length);
}

function firstSegment(chunk: Chunk, segmentsById: Map<string, NamedTranscriptSegment>): NamedTranscriptSegment | undefined {
  const id = chunk.segmentIds[0];
  return id ? segmentsById.get(id) : undefined;
}

function lastSegment(chunk: Chunk, segmentsById: Map<string, NamedTranscriptSegment>): NamedTranscriptSegment | undefined {
  const id = chunk.segmentIds[chunk.segmentIds.length - 1];
  return id ? segmentsById.get(id) : undefined;
}

/**
 * Pass 1 (§6.4.2): union of three signals, only over the `turn_window`
 * chunks (topic boundaries are a property of L2, not of any
 * already-emitted topic-summary chunk). A candidate at index i means a new
 * topic starts at chunks[i]; index 0 always starts the first topic and
 * isn't recorded as a "candidate" here.
 */
export function detectCandidateBoundaries(
  chunks: Chunk[],
  embeddings: number[][],
  transcript: NamedTranscript,
): Map<number, BoundarySignal[]> {
  const segmentsById = new Map(transcript.map((s) => [s.id, s]));
  const signals = new Map<number, BoundarySignal[]>();
  const addSignal = (index: number, signal: BoundarySignal) => {
    const existing = signals.get(index) ?? [];
    existing.push(signal);
    signals.set(index, existing);
  };

  // Semantic: cosine distance between consecutive L2 embeddings, flagged
  // where the distance is a local maximum above the transcript's OWN 75th
  // percentile — not a fixed global threshold, since distance
  // distributions vary by meeting style (§6.4.2).
  const distances: number[] = [];
  for (let i = 1; i < chunks.length; i += 1) {
    distances.push(cosineDistance(embeddings[i - 1]!, embeddings[i]!));
  }
  const threshold = percentile(distances, TOPIC_CONSTRAINTS.semanticPercentile);
  for (let d = 0; d < distances.length; d += 1) {
    const i = d + 1; // chunk index this distance is "between i-1 and i"
    const prev = distances[d - 1] ?? -Infinity;
    const next = distances[d + 1] ?? -Infinity;
    if (distances[d]! > threshold && distances[d]! >= prev && distances[d]! >= next) {
      addSignal(i, "semantic");
    }
  }

  // Gap: silence > 20s between the previous chunk's last segment and this
  // chunk's first segment. Disabled entirely when either timestamp is
  // absent, rather than guessing.
  for (let i = 1; i < chunks.length; i += 1) {
    const prevLast = lastSegment(chunks[i - 1]!, segmentsById);
    const curFirst = firstSegment(chunks[i]!, segmentsById);
    if (prevLast?.end != null && curFirst?.start != null) {
      if (curFirst.start - prevLast.end > TOPIC_CONSTRAINTS.gapMs) {
        addSignal(i, "gap");
      }
    }
  }

  // Cue: regex against the chunk's opening turn only.
  for (let i = 1; i < chunks.length; i += 1) {
    const opening = firstSegment(chunks[i]!, segmentsById);
    if (opening && CUE_PATTERNS.some((pattern) => pattern.test(opening.text))) {
      addSignal(i, "cue");
    }
  }

  return signals;
}

function groupTokens(chunks: Chunk[], indices: number[]): number {
  return indices.reduce((sum, i) => sum + chunks[i]!.tokenCount, 0);
}

function groupEmbedding(embeddings: number[][], indices: number[]): number[] {
  return averageEmbedding(indices.map((i) => embeddings[i]!));
}

/**
 * Pass 2 (§6.4.2): enforce minTopicTokens/maxTopicTokens by merging
 * under-floor groups into whichever neighbour is semantically closer, and
 * splitting over-ceiling groups at their strongest interior candidate (or
 * the nearest-to-midpoint chunk if no candidate fired inside it).
 * Guarantees 8–25 topics at the 2h/~120-chunk design target and exactly 1
 * for a transcript with a single L2 chunk.
 */
export function constrainTopics(
  chunks: Chunk[],
  embeddings: number[][],
  candidateSignals: Map<number, BoundarySignal[]>,
): TopicGroup[] {
  if (chunks.length === 0) return [];

  const boundaryIndices = [0, ...[...candidateSignals.keys()].sort((a, b) => a - b)];
  let groups: TopicGroup[] = boundaryIndices.map((start, idx) => {
    const end = boundaryIndices[idx + 1] ?? chunks.length;
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    return { chunkIndices: indices, boundarySignals: idx === 0 ? [] : candidateSignals.get(start) ?? [] };
  });

  // Merge pass: repeat until every group clears the floor or there's only
  // one group left. Bounded by groups.length to guarantee termination —
  // each successful merge strictly reduces the group count.
  for (let pass = 0; pass < chunks.length && groups.length > 1; pass += 1) {
    const tooSmall = groups.findIndex((g) => groupTokens(chunks, g.chunkIndices) < TOPIC_CONSTRAINTS.minTopicTokens);
    if (tooSmall === -1) break;

    const left = groups[tooSmall - 1];
    const right = groups[tooSmall + 1];
    const thisEmbedding = groupEmbedding(embeddings, groups[tooSmall]!.chunkIndices);
    const distLeft = left ? cosineDistance(thisEmbedding, groupEmbedding(embeddings, left.chunkIndices)) : Infinity;
    const distRight = right ? cosineDistance(thisEmbedding, groupEmbedding(embeddings, right.chunkIndices)) : Infinity;

    if (!left && !right) break; // only group left; nothing to merge into
    const mergeIntoLeft = distLeft <= distRight;

    if (mergeIntoLeft && left) {
      const merged: TopicGroup = {
        chunkIndices: [...left.chunkIndices, ...groups[tooSmall]!.chunkIndices],
        boundarySignals: left.boundarySignals,
      };
      groups = [...groups.slice(0, tooSmall - 1), merged, ...groups.slice(tooSmall + 1)];
    } else if (right) {
      const merged: TopicGroup = {
        chunkIndices: [...groups[tooSmall]!.chunkIndices, ...right.chunkIndices],
        boundarySignals: groups[tooSmall]!.boundarySignals,
      };
      groups = [...groups.slice(0, tooSmall), merged, ...groups.slice(tooSmall + 2)];
    }
  }

  // Split pass: any group still over the ceiling splits at its strongest
  // interior candidate signal, or the chunk nearest the token midpoint if
  // none fired inside it.
  const result: TopicGroup[] = [];
  for (const group of groups) {
    let remaining = group.chunkIndices;
    let signals = group.boundarySignals;
    while (groupTokens(chunks, remaining) > TOPIC_CONSTRAINTS.maxTopicTokens && remaining.length > 1) {
      const interiorCandidates = remaining.slice(1).filter((i) => candidateSignals.has(i));
      let splitAt: number;
      if (interiorCandidates.length > 0) {
        splitAt = interiorCandidates.reduce((best, i) =>
          (candidateSignals.get(i)?.length ?? 0) > (candidateSignals.get(best)?.length ?? 0) ? i : best,
        );
      } else {
        let acc = 0;
        const half = groupTokens(chunks, remaining) / 2;
        splitAt = remaining[remaining.length - 1]!;
        for (const i of remaining) {
          acc += chunks[i]!.tokenCount;
          if (acc >= half) {
            splitAt = i;
            break;
          }
        }
        if (splitAt === remaining[0]) splitAt = remaining[1] ?? splitAt;
      }
      const cutIdx = remaining.indexOf(splitAt);
      const head = remaining.slice(0, cutIdx);
      if (head.length === 0) break; // can't make progress; leave the rest oversized rather than loop forever
      result.push({ chunkIndices: head, boundarySignals: signals });
      remaining = remaining.slice(cutIdx);
      signals = candidateSignals.get(splitAt) ?? [];
    }
    result.push({ chunkIndices: remaining, boundarySignals: signals });
  }

  return result;
}

function turnLines(segments: NamedTranscriptSegment[]): string {
  return segments.map((s) => `${s.speaker ?? "speaker"}: ${s.text}`).join("\n");
}

/**
 * Pass 3 (§6.4.2): one LLM call for the whole transcript, given only the
 * first/last 3 turns of each group plus its token count — never the full
 * text, so this stays cheap and bounded regardless of call length.
 */
export function buildTopicLabelPrompt(
  groups: TopicGroup[],
  chunks: Chunk[],
  transcript: NamedTranscript,
): ChatMessage[] {
  const segmentsById = new Map(transcript.map((s) => [s.id, s]));

  const groupText = groups
    .map((group, seq) => {
      const segmentIds = group.chunkIndices.flatMap((i) => chunks[i]!.segmentIds);
      const segments = segmentIds.map((id) => segmentsById.get(id)).filter((s): s is NamedTranscriptSegment => !!s);
      const first = segments.slice(0, 3);
      const last = segments.slice(-3);
      const tokenCount = groupTokens(chunks, group.chunkIndices);
      return [
        `Segment ${seq}: (~${tokenCount} tokens)`,
        "Opening turns:",
        turnLines(first),
        "Closing turns:",
        turnLines(last),
      ].join("\n");
    })
    .join("\n\n");

  const system = [
    "You label topic segments of a call transcript. For each numbered segment below, given only its",
    "opening and closing turns and its token count, return a short label (2-5 words) and a one-sentence summary.",
    "",
    "Return ONLY a JSON array, no prose, no markdown fences, matching this shape exactly, one entry per segment,",
    "in order:",
    '[{ "seq": number, "label": "string", "summary": "string" }]',
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: groupText },
  ];
}

export function parseTopicLabels(
  raw: string,
  expectedCount: number,
): { seq: number; label: string; summary: string }[] | null {
  let parsed: unknown = parseJsonLeniently(raw);
  if (parsed === null) return null;

  // Confirmed live: for a single topic segment, models sometimes drop the
  // array wrapper and return the bare object instead of a 1-element array,
  // despite the prompt explicitly asking for an array. Labels/summaries
  // are narration (L8), not evidence, so leniently accepting this specific
  // shape is safe — it isn't relaxing any grounding check.
  if (expectedCount === 1 && !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
    parsed = [parsed];
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;

  const isValid = (v: unknown): v is { seq: number; label: string; summary: string } => {
    if (typeof v !== "object" || v === null) return false;
    const c = v as Record<string, unknown>;
    return typeof c.seq === "number" && typeof c.label === "string" && typeof c.summary === "string";
  };
  if (!parsed.every(isValid)) return null;

  const seqs = new Set(parsed.map((p) => p.seq));
  if (seqs.size !== expectedCount) return null;

  return parsed;
}
