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
  confidence: "high" | "medium" | "low";
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

/**
 * An L2 turn-window or L1.5 topic-summary chunk produced by
 * chunking/windower.ts and chunking/topics.ts. `body` is exactly the text
 * that gets embedded, so it's also the only text that grounding checks
 * (chat/validateCitations.ts) may ever validate a citation against — never
 * the original segment's full text, since a chunk can hold only part of a
 * segment (the single over-long-turn split case in the windower).
 * `attributionUncertain` is set at ingest time when any speaker label
 * contributing to `segmentIds` was not resolved with high confidence — see
 * chunking/attribution.ts.
 */
export type Chunk = {
  tier: "turn_window" | "topic_summary";
  seq: number;
  body: string;
  segmentIds: string[];
  anchorSegmentId: string | null;
  tokenCount: number;
  attributionUncertain: boolean;
};

/** Which boundary-detection signal fired at a given candidate split point. */
export type BoundarySignal = "semantic" | "gap" | "cue";

/**
 * L1.5 topic segment: a contiguous, labeled section of the call spanning
 * one or more L2 turn windows. Heuristic and used only for context
 * expansion / whole-call summarization — never for access control or
 * citation (a citation always resolves through a chunk's own segmentIds).
 */
export type TopicSegment = {
  seq: number;
  label: string;
  summary: string;
  segmentIds: string[];
  tokenCount: number;
  boundarySignals: BoundarySignal[];
  attributionUncertain: boolean;
};

/**
 * A chat citation. `quote` is mandatory, not optional decoration — the
 * evidence gate (chat/validateCitations.ts) requires it to be an exact
 * substring of the text actually shown to the model for `chunkId`, the
 * same grounding discipline `Evidence`/`allEvidenceIsGrounded` apply to
 * call insights, adapted for chat's windowed (not whole-transcript)
 * context.
 */
export type ChatCitation = {
  segmentId: string;
  chunkId: string;
  quote: string;
};

/** Structured output of a single chat turn, before the live ACL re-check. */
export type ChatAnswer = {
  answer: string;
  citations: ChatCitation[];
};
