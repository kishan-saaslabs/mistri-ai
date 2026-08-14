import type { ChatCitation } from "../types.js";

export type ShownContext = {
  /** Exactly the text assembled into the prompt for this chunk — never a
   * fresh lookup of the original segment's full text (see the plan's
   * "Reliability requirements": for a split over-long turn, two different
   * chunks share one segment id but hold different text, and validating
   * against the segment's full text would let a citation pass quoting
   * wording the model was never actually shown). */
  shownText: string;
  /** The segment ids actually present in this chunk, so a citation can't
   * pair a real chunkId with a segmentId that doesn't belong to it. */
  segmentIds: string[];
  attributionUncertain: boolean;
};

export type ValidationResult = {
  validCitations: ChatCitation[];
  droppedCount: number;
  anyAttributionUncertain: boolean;
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The chat-side evidence gate: every citation's quote must be an exact
 * (normalized) substring of the shown text for its own chunkId, and its
 * segmentId must actually belong to that chunk. This is deliberately
 * stricter than a segment-level check — see ShownContext above for why a
 * segment-level check isn't safe for chat specifically.
 */
export function validateCitations(
  citations: ChatCitation[],
  shownContextByChunkId: Map<string, ShownContext>,
): ValidationResult {
  const validCitations: ChatCitation[] = [];
  let droppedCount = 0;
  let anyAttributionUncertain = false;

  for (const citation of citations) {
    const context = shownContextByChunkId.get(citation.chunkId);
    if (!context) {
      droppedCount += 1;
      continue;
    }
    if (!context.segmentIds.includes(citation.segmentId)) {
      droppedCount += 1;
      continue;
    }
    if (!normalize(context.shownText).includes(normalize(citation.quote))) {
      droppedCount += 1;
      continue;
    }
    validCitations.push(citation);
    if (context.attributionUncertain) anyAttributionUncertain = true;
  }

  return { validCitations, droppedCount, anyAttributionUncertain };
}
