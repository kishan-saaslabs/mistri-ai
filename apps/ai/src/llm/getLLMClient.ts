import { llmConfig } from "../config/env.js";
import type { LLMClient } from "./llmClient.js";
import { OpenAiCompatibleClient } from "./openAiCompatibleClient.js";

/**
 * The ONLY place provider selection logic should ever live. Everything
 * outside apps/ai/src/llm/ depends on LLMClient, never on a concrete
 * provider — so adding a provider that doesn't speak the OpenAI wire
 * format (e.g. native Anthropic Messages API) means adding a branch here
 * keyed on llmConfig.providerLabel, and nothing else changes:
 *
 *   if (llmConfig.providerLabel === "anthropic-native") {
 *     return new AnthropicNativeClient({ ...llmConfig });
 *   }
 *
 * Today every supported provider (NVIDIA NIM, OpenAI, Groq, Together.ai)
 * speaks the OpenAI-compatible format, so this always returns that one
 * implementation.
 */
export function getLLMClient(): LLMClient {
  if (!llmConfig.apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Set LLM_API_KEY (and optionally LLM_BASE_URL / LLM_MODEL) " +
        "in the root .env before calling any speaker-inference feature.",
    );
  }

  return new OpenAiCompatibleClient({
    baseUrl: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
  });
}
