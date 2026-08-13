/**
 * Canonical home for TranscriptSegment. apps/api re-exports this from
 * apps/api/src/types/transcript.ts rather than declaring its own copy —
 * see the "Type decision" in the apps/ai build notes for why this lives
 * here and not there (apps/api depends on apps/ai, not the other way
 * around, so the type has to flow in that same direction).
 */
export type TranscriptSegment = {
  id: string;
  type: "final" | "partial";
  start: number | null;
  end: number | null;
  speaker: string | null;
  text: string;
};

export type Transcript = TranscriptSegment[];

/** Maps a raw diarization label ("speaker_1") to a display name. */
export type SpeakerMap = Record<string, string>;

export type NamedTranscriptSegment = TranscriptSegment & {
  speakerName: string;
};

export type NamedTranscript = NamedTranscriptSegment[];

export type InferredSpeaker = {
  label: string;
  suggestedName: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
};
