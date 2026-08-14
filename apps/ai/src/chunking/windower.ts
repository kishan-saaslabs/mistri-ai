import { encode } from "gpt-tokenizer";
import type { Chunk, NamedTranscript, NamedTranscriptSegment } from "../types.js";
import { selectAnchor } from "./anchors.js";

export const CHUNKING = {
  targetTokens: 200,
  maxTokens: 400,
  minTokens: 50,
  overlapTurns: 1,
  speakerChangePreferenceWindow: 0.15,
  shortTurnWords: 4,
} as const;

/** Exported so callers building non-turn-window chunk bodies (e.g. the
 * topic-summary tier in kbIngestService) count tokens the same way. */
export function tokenCount(text: string): number {
  return encode(text).length;
}

/** Raw diarization label, never the resolved display name — see the plan's
 * note on why chunk bodies embed the label, not the name (a future name
 * correction shouldn't require re-embedding). Non-diarized segments
 * (speaker === null) share one generic label; they're indistinguishable
 * individuals anyway with no diarization to tell them apart. */
function renderLabel(segment: NamedTranscriptSegment): string {
  return segment.speaker ?? "speaker";
}

function renderTurn(segment: NamedTranscriptSegment): string {
  return `${renderLabel(segment)}: ${segment.text}`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isShortTurn(segment: NamedTranscriptSegment): boolean {
  return wordCount(segment.text) <= CHUNKING.shortTurnWords;
}

function makeChunk(
  seq: number,
  window: NamedTranscriptSegment[],
  bodyOverride?: { body: string; segmentIds: string[] },
): Chunk {
  const body = bodyOverride?.body ?? window.map(renderTurn).join("\n");
  const segmentIds = bodyOverride?.segmentIds ?? window.map((s) => s.id);
  return {
    tier: "turn_window",
    seq,
    body,
    segmentIds,
    anchorSegmentId: selectAnchor(window),
    tokenCount: tokenCount(body),
    attributionUncertain: false, // filled in by kbIngestService, which has inferredSpeakers
  };
}

/**
 * Splits a single over-long turn (> maxTokens) on sentence boundaries via
 * Intl.Segmenter — never a chunking library, per the source spec's
 * reasoning that none of them preserve utterance ids. Each resulting part
 * is emitted as its own chunk, but ALL parts share the one original
 * segment id: a citation into either half is still a citation into a real
 * utterance. This is exactly the case chat's grounding check (item 1 in
 * the plan's "Reliability requirements") has to handle carefully — quote
 * validation must check against the specific chunk's own body text, never
 * against the full original segment text, or a citation could "validate"
 * against wording the model was never shown (the half it didn't get).
 */
function splitOverLongTurn(segment: NamedTranscriptSegment, seq: number): Chunk[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const sentences = [...segmenter.segment(segment.text)].map((s) => s.segment);
  const label = renderLabel(segment);

  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && tokenCount(candidate) > CHUNKING.targetTokens) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  if (parts.length === 0) parts.push(segment.text);

  return parts.map((part, index) => {
    const body = `${label}: ${part}`;
    return {
      tier: "turn_window" as const,
      seq: seq + index,
      body,
      segmentIds: [segment.id],
      anchorSegmentId: segment.id,
      tokenCount: tokenCount(body),
      attributionUncertain: false,
    };
  });
}

/**
 * L2 turn-window chunking (§6.3 of the source spec, ported as-is — see
 * the plan). One code path regardless of call length or speaker count.
 * Only "final" segments are windowed, same exclusion speaker-name
 * inference and call-insights already apply — partial/unfinalized text is
 * never reliable enough to embed or cite.
 *
 * Two deliberate corrections to the source spec's own pseudocode, both
 * needed to keep the "no utterance is ever lost" invariant true:
 * 1. If an over-long turn is hit mid-window, the in-progress window is
 *    emitted first, not silently discarded — the spec's pseudocode jumps
 *    straight to the split-and-continue and drops whatever had
 *    accumulated so far.
 * 2. The 1-turn overlap step-back is clamped to guarantee forward
 *    progress. A window that ends up exactly `overlapTurns` long would
 *    otherwise make the next window start at the same index forever.
 */
export function windowTranscript(transcript: NamedTranscript): Chunk[] {
  const eligible = transcript.filter((segment) => segment.type === "final");
  if (eligible.length === 0) return [];

  const chunks: Chunk[] = [];
  let i = 0;
  let seq = 0;

  while (i < eligible.length) {
    const windowStart = i;
    const window: NamedTranscriptSegment[] = [];
    let tokens = 0;
    let hitOverLongTurn = false;

    while (i < eligible.length) {
      const segment = eligible[i]!; // i < eligible.length is the loop guard
      const rendered = renderTurn(segment);
      const t = tokenCount(rendered);

      if (t > CHUNKING.maxTokens) {
        hitOverLongTurn = true;
        break;
      }

      if (tokens + t > CHUNKING.targetTokens && tokens >= CHUNKING.minTokens) {
        break;
      }

      window.push(segment);
      tokens += t;
      i += 1;

      const next = eligible[i];
      if (
        tokens >= CHUNKING.targetTokens * (1 - CHUNKING.speakerChangePreferenceWindow) &&
        next &&
        next.speaker !== segment.speaker &&
        !isShortTurn(segment)
      ) {
        break;
      }
    }

    if (window.length > 0) {
      chunks.push(makeChunk(seq, window));
      seq += 1;
    }

    if (hitOverLongTurn) {
      // Same i just read at the top of the inner loop when hitOverLongTurn was set.
      const overLong = eligible[i]!;
      const parts = splitOverLongTurn(overLong, seq);
      chunks.push(...parts);
      seq += parts.length;
      i += 1;
      continue;
    }

    if (window.length === 0) {
      // Shouldn't happen (eligible[i] always fits the inner loop's first
      // iteration unless it's over-long, which is handled above), but
      // guarantees termination rather than looping forever if it ever did.
      i += 1;
      continue;
    }

    // If this window already consumed every remaining utterance, stepping
    // back for the 1-turn overlap would spawn a redundant tail window that
    // just re-covers the same content (or, at the transcript's true end,
    // an infinite loop). Only apply the overlap when there's genuinely
    // more transcript left to window.
    if (i >= eligible.length) {
      continue;
    }
    const overlapStart = i - CHUNKING.overlapTurns;
    i = Math.max(overlapStart, windowStart + 1);
  }

  return chunks;
}
