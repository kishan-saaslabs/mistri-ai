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
  Chunk,
  BoundarySignal,
  TopicSegment,
  ChatCitation,
  ChatAnswer,
} from "./types.js";

export type { ChatMessage, LLMClient } from "./llm/llmClient.js";
export { getLLMClient, getInsightsLLMClient, getChatLLMClient, getEmbeddingClient } from "./llm/getLLMClient.js";
export { applySpeakerNames, renderNamedTranscript } from "./speakerNameMapper.js";
export { inferSpeakerNames } from "./speakerInference.js";
export { generateCallInsights } from "./callInsights.js";

export type { EmbeddingClient } from "./embedding/embeddingClient.js";
export { OpenAiCompatibleEmbeddingClient } from "./embedding/embeddingClient.js";

export { CHUNKING, windowTranscript, tokenCount } from "./chunking/windower.js";
export { selectAnchor } from "./chunking/anchors.js";
export { isAttributionUncertain } from "./chunking/attribution.js";
export {
  TOPIC_CONSTRAINTS,
  detectCandidateBoundaries,
  constrainTopics,
  buildTopicLabelPrompt,
  parseTopicLabels,
} from "./chunking/topics.js";
export type { TopicGroup } from "./chunking/topics.js";

export { contextualizeQuery } from "./chat/contextualize.js";
export type { ChatTurn, ContextualizeResult } from "./chat/contextualize.js";
export { generateChatAnswer } from "./chat/generate.js";
export type { ChatGenerationInput, EvidenceBlock } from "./chat/generate.js";
export { validateCitations } from "./chat/validateCitations.js";
export type { ShownContext, ValidationResult } from "./chat/validateCitations.js";
export { generateDealSynthesisAnswer, validateDealCitations } from "./chat/dealSynthesis.js";
export type { DealBlock, DealCitation, DealSynthesisAnswer, DealSynthesisInput } from "./chat/dealSynthesis.js";
