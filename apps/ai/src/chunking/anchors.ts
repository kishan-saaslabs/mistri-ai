import type { TranscriptSegment } from "../types.js";

/**
 * Picks the single utterance a chunk should cite if generation doesn't
 * pick one explicitly — guarantees every retrieved chunk has a citable
 * line even before the model reasons about it. The source spec's version
 * prefers the longest utterance from the customer's ("external") side;
 * this repo has no internal/external side concept (speaker naming
 * resolves real names, not roles), so the rule simplifies to the longest
 * utterance in the chunk, later position as the tiebreak.
 */
export function selectAnchor(segments: TranscriptSegment[]): string | null {
  let best: TranscriptSegment | null = null;
  for (const segment of segments) {
    if (!best || segment.text.length >= best.text.length) {
      best = segment;
    }
  }
  return best?.id ?? null;
}
