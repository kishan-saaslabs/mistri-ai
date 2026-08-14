import { llmConfig } from "../config/env.js";
import type { EmbeddingClient } from "../embedding/embeddingClient.js";
import { OpenAiCompatibleEmbeddingClient } from "../embedding/embeddingClient.js";
import type { LLMClient } from "./llmClient.js";
import { OpenAiCompatibleClient } from "./openAiCompatibleClient.js";

export type GetLLMClientOverrides = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  thinkingMode?: boolean;
};

/**
 * The ONLY place provider selection logic should ever live. Everything
 * outside apps/ai/src/llm/ depends on LLMClient, never on a concrete
 * provider — so adding a provider that doesn't speak the OpenAI wire
 * format (e.g. native Anthropic Messages API) means adding a branch here
 * keyed on llmConfig.providerLabel (or llmConfig.providerLabelInsights for
 * the insights call site specifically), and nothing else changes:
 *
 *   if (llmConfig.providerLabelInsights === "anthropic-native") {
 *     return new AnthropicNativeClient({ ...llmConfig });
 *   }
 *
 * Today every supported provider (NVIDIA NIM, OpenAI, Groq, Together.ai,
 * Anthropic via an OpenAI-compatible shim, etc.) speaks the OpenAI-
 * compatible format, so this always returns that one implementation.
 */
export function getLLMClient(overrides?: GetLLMClientOverrides): LLMClient {
  const apiKey = overrides?.apiKey ?? llmConfig.apiKey;

  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Set LLM_API_KEY (and optionally LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL, " +
        "or their *_INSIGHTS counterparts for the call-insights call site) in the root .env before " +
        "calling any speaker-inference or call-insights feature.",
    );
  }

  return new OpenAiCompatibleClient({
    baseUrl: overrides?.baseUrl ?? llmConfig.baseUrl,
    apiKey,
    model: overrides?.model ?? llmConfig.model,
    thinkingMode: overrides?.thinkingMode,
  });
}

/**
 * Convenience wrapper for the call-insights call site. Resolves every
 * connection property independently — LLM_PROVIDER_INSIGHTS (logging
 * only, see the branch point above), LLM_BASE_URL_INSIGHTS, LLM_MODEL_INSIGHTS,
 * LLM_API_KEY_INSIGHTS, LLM_THINKING_MODE_INSIGHTS — each falling back to
 * its shared (non-insights) counterpart if unset. This is what lets call
 * insights run on an entirely different provider account (or a wholly
 * different provider) than speaker naming, not just a different model on
 * the same one, without apps/api ever reaching into apps/ai's config
 * shape directly. Speaker naming keeps calling plain getLLMClient() with
 * no argument; nothing changes there.
 */
export function getInsightsLLMClient(): LLMClient {
  return getLLMClient({
    baseUrl: llmConfig.baseUrlInsights,
    model: llmConfig.modelInsights,
    apiKey: llmConfig.apiKeyInsights,
    thinkingMode: llmConfig.thinkingModeInsights,
  });
}

/** Convenience wrapper for the chat call site — same independent-profile pattern as getInsightsLLMClient(). */
export function getChatLLMClient(): LLMClient {
  return getLLMClient({
    baseUrl: llmConfig.baseUrlChat,
    model: llmConfig.modelChat,
    apiKey: llmConfig.apiKeyChat,
    thinkingMode: llmConfig.thinkingModeChat,
  });
}

/**
 * Embedding is a separate wire format from chat completions (see
 * embedding/embeddingClient.ts), so it isn't built from getLLMClient()
 * above — but it resolves its connection properties the exact same way:
 * every *_EMBEDDING value falls back to its non-suffixed counterpart.
 */
export function getEmbeddingClient(): EmbeddingClient {
  const apiKey = llmConfig.apiKeyEmbedding;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY_EMBEDDING (or LLM_API_KEY as a fallback) is not set. Set one of them in the root " +
        ".env before calling any chunk-embedding feature.",
    );
  }

  // See embeddingClient.ts's wireFormat comment: NIM and OpenAI need
  // opposite request bodies for this endpoint. "openai" is selected only
  // when the label explicitly says so; every other label (nvidia, or
  // anything else) keeps the NIM-shaped request, since that's the only
  // other wire format actually verified live so far.
  const wireFormat = llmConfig.providerLabelEmbedding.toLowerCase() === "openai" ? "openai" : "nim";

  return new OpenAiCompatibleEmbeddingClient({
    baseUrl: llmConfig.baseUrlEmbedding,
    apiKey,
    model: llmConfig.modelEmbedding,
    dimensions: llmConfig.embeddingDimensions,
    wireFormat,
  });
}
