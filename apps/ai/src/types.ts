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

/** A citation back to the exact segment a claim is grounded in. */
export type Evidence = {
  segmentId: string;
  quote: string;
};

export type CallInsightSummaryItem = {
  title: string;
  text: string;
  evidence: Evidence[];
};

export type CallInsightObjection = {
  title: string;
  text: string;
  evidence: Evidence[];
};

export type CallInsightCustomerWant = {
  label: string;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
};

export type CallInsightNextStep = {
  text: string;
  owner: string;
  evidence: Evidence[];
};

export type CallInsightFollowUpEmail = {
  subject: string;
  body: string;
  evidence: Evidence[];
};

/**
 * What happened on the call / what objections came up / what the customer
 * wants / what to do next — generated from the named transcript (real
 * speaker names, not speaker_1/speaker_2) once speaker inference succeeds.
 * Every claim is grounded with evidence pointing back to a real segment id.
 */
export type CallInsights = {
  summary: CallInsightSummaryItem[];
  objections: CallInsightObjection[];
  customerWants: CallInsightCustomerWant[];
  nextSteps: CallInsightNextStep[];
  followUpEmail: CallInsightFollowUpEmail | null;
};
