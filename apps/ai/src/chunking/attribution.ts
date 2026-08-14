import type { InferredSpeaker, NamedTranscript } from "../types.js";

/**
 * Whether a chunk/topic drawing on these segment ids should be flagged as
 * attribution-uncertain in chat answers. Speaker-name inference already
 * produces a confidence per label (positionalFallback in
 * speakerInference.ts always emits "low" — it only runs after the LLM
 * pass fails twice) — this was previously computed and then discarded;
 * this is the join that carries it forward instead. A label missing from
 * `inferredSpeakers` (shouldn't happen for a fully-processed transcript,
 * but not guaranteed by the type system) is treated as uncertain rather
 * than assumed trustworthy.
 */
export function isAttributionUncertain(
  segmentIds: string[],
  transcript: NamedTranscript,
  inferredSpeakers: InferredSpeaker[],
): boolean {
  const confidenceByLabel = new Map(inferredSpeakers.map((s) => [s.label, s.confidence]));
  const speakerBysegmentId = new Map(transcript.map((segment) => [segment.id, segment.speaker]));

  return segmentIds.some((segmentId) => {
    const speaker = speakerBysegmentId.get(segmentId);
    if (speaker === undefined || speaker === null) return true;
    const confidence = confidenceByLabel.get(speaker);
    return confidence === undefined || confidence !== "high";
  });
}
