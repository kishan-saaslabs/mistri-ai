export type {
  TranscriptSegment,
  Transcript,
  SpeakerMap,
  NamedTranscriptSegment,
  NamedTranscript,
  InferredSpeaker,
  Evidence,
  CallInsightSummaryItem,
  CallInsightObjection,
  CallInsightCustomerWant,
  CallInsightNextStep,
  CallInsightFollowUpEmail,
  CallInsights,
} from "./types.js";

export type { ChatMessage, LLMClient } from "./llm/llmClient.js";
export { getLLMClient } from "./llm/getLLMClient.js";
export { applySpeakerNames, renderNamedTranscript } from "./speakerNameMapper.js";
export { inferSpeakerNames } from "./speakerInference.js";
export { generateCallInsights } from "./callInsights.js";
