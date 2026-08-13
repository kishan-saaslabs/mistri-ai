import type { NamedTranscript, NamedTranscriptSegment, SpeakerMap, Transcript } from "./types.js";

export const UNKNOWN_SPEAKER_NAME = "Unknown Speaker";

/**
 * Pure function: adds a speakerName to every segment. speaker === null has
 * no label to look up (non-diarized/mono audio) and always gets the fixed
 * "Unknown Speaker" literal. type: "partial" segments have a real speaker
 * label and just inherit whatever name was resolved for that label — the
 * same as any other segment for that speaker. No special-casing needed
 * here; partial segments are excluded from the *inference input* upstream
 * in speakerInference.ts, not from this reassembly step.
 */
export function applySpeakerNames(transcript: Transcript, speakerMap: SpeakerMap): NamedTranscript {
  return transcript.map((segment): NamedTranscriptSegment => {
    if (segment.speaker === null) {
      return { ...segment, speakerName: UNKNOWN_SPEAKER_NAME };
    }
    return { ...segment, speakerName: speakerMap[segment.speaker] ?? segment.speaker };
  });
}

/** Flattens a named transcript into "SpeakerName: text" lines. */
export function renderNamedTranscript(named: NamedTranscript): string {
  return named.map((segment) => `${segment.speakerName}: ${segment.text}`).join("\n");
}
