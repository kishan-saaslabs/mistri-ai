import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../../../../.env"),
  resolve(here, "../../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
];

for (const file of candidates) {
  if (existsSync(file)) {
    loadEnv({ path: file, override: false });
  }
}

// Plain z.string().optional() only treats a KEY THAT'S ABSENT from
// process.env as undefined — a .env line left as `KEY=` (present, empty
// string) still gets validated as "" and fails .min(1)/.url() checks.
// Every optional string field needs this trim-and-blank-to-undefined
// transform, or an empty-but-present .env line throws at startup instead
// of being treated as "not set."
function optionalTrimmedString(maxLength?: number) {
  const base = maxLength !== undefined ? z.string().max(maxLength) : z.string();
  return base.optional().transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : undefined;
  });
}

// Same present-but-empty-string problem as optionalTrimmedString, for an
// enum instead of a free string: a blank `KEY=` .env line must mean "not
// set," not "validate the empty string against the enum and fail." Strips
// the blank case before the enum check ever runs.
function optionalTrimmedEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.enum(values).optional());
}

const envSchema = z.object({
  LLM_PROVIDER: z.string().min(1).default("nvidia"),
  LLM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  LLM_API_KEY: optionalTrimmedString(512),
  LLM_MODEL: z.string().min(1).default("meta/llama-3.1-8b-instruct"),
  // No .default()/fallback here on purpose for any of these: zod can't
  // express "default to another field's parsed value" declaratively. All
  // left optional and resolved below, after parsing, against their
  // LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL / LLM_API_KEY counterparts —
  // lets the insights call site run on an entirely different provider
  // (different endpoint, different account, different rate limits), not
  // just a different model on the same NVIDIA NIM account.
  LLM_PROVIDER_INSIGHTS: optionalTrimmedString(),
  LLM_BASE_URL_INSIGHTS: optionalTrimmedString().refine(
    (value) => value === undefined || value.startsWith("http://") || value.startsWith("https://"),
    { message: "LLM_BASE_URL_INSIGHTS must be an http(s) URL" },
  ),
  LLM_MODEL_INSIGHTS: optionalTrimmedString(),
  LLM_API_KEY_INSIGHTS: optionalTrimmedString(512),
  // Explicit reasoning toggle for the insights call site (minimax-m3 is a
  // reasoning model). Not z.coerce.boolean() on purpose — that treats any
  // non-empty string, including the literal text "false", as true. Left
  // as an enum so an unset value is distinguishable from an explicit one:
  // unset means "don't send the field at all, use the model's own default."
  LLM_THINKING_MODE_INSIGHTS: optionalTrimmedEnum(["true", "false"]),

  // Embedding is its own call site (a chat-completions model and an
  // embeddings model are rarely the same account, sometimes not even the
  // same provider), following the exact same fallback-to-base pattern as
  // *_INSIGHTS above.
  LLM_PROVIDER_EMBEDDING: optionalTrimmedString(),
  LLM_BASE_URL_EMBEDDING: optionalTrimmedString().refine(
    (value) => value === undefined || value.startsWith("http://") || value.startsWith("https://"),
    { message: "LLM_BASE_URL_EMBEDDING must be an http(s) URL" },
  ),
  LLM_MODEL_EMBEDDING: optionalTrimmedString(),
  LLM_API_KEY_EMBEDDING: optionalTrimmedString(512),
  // pgvector's embedding column has a fixed width (vector(1024) in
  // schema.sql) — this is NOT independently configurable per org the way
  // the other embedding fields are; it exists so the dimension actually in
  // use is visible in one place rather than hardcoded at each call site.
  // Changing it after chunks already exist requires a re-embedding
  // migration (the "one irreversible decision" the source spec calls out).
  LLM_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),

  // Chat generation is a third call site, distinct from insights in
  // latency/volume profile (interactive, streamed, one call per turn vs.
  // one call per transcript).
  LLM_PROVIDER_CHAT: optionalTrimmedString(),
  LLM_BASE_URL_CHAT: optionalTrimmedString().refine(
    (value) => value === undefined || value.startsWith("http://") || value.startsWith("https://"),
    { message: "LLM_BASE_URL_CHAT must be an http(s) URL" },
  ),
  LLM_MODEL_CHAT: optionalTrimmedString(),
  LLM_API_KEY_CHAT: optionalTrimmedString(512),
  LLM_THINKING_MODE_CHAT: optionalTrimmedEnum(["true", "false"]),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid LLM environment configuration: ${details}`);
}

export const llmEnv = parsed.data;

export type LLMConfig = {
  providerLabel: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  /** Logging-only label for the insights call site. Falls back to `providerLabel` (LLM_PROVIDER) if LLM_PROVIDER_INSIGHTS is unset. Not yet read by any branch — see getLLMClient.ts for where a non-OpenAI-compatible insights provider would key off this. */
  providerLabelInsights: string;
  /** Endpoint for the insights call site. Falls back to `baseUrl` (LLM_BASE_URL) if LLM_BASE_URL_INSIGHTS is unset — this is what lets insights point at a genuinely different provider, not just a different model on the same account. */
  baseUrlInsights: string;
  /** Model for the call-insights call site. Falls back to `model` (LLM_MODEL) if LLM_MODEL_INSIGHTS is unset. */
  modelInsights: string;
  /** API key for the call-insights call site. Falls back to `apiKey` (LLM_API_KEY) if LLM_API_KEY_INSIGHTS is unset. */
  apiKeyInsights: string | undefined;
  /** Explicit thinking-mode toggle for the insights call site. undefined = don't send the field, use the model's own default. */
  thinkingModeInsights: boolean | undefined;

  providerLabelEmbedding: string;
  baseUrlEmbedding: string;
  modelEmbedding: string;
  apiKeyEmbedding: string | undefined;
  /** Fixed per deployment — see the comment on LLM_EMBEDDING_DIMENSIONS in envSchema. */
  embeddingDimensions: number;

  providerLabelChat: string;
  baseUrlChat: string;
  modelChat: string;
  apiKeyChat: string | undefined;
  thinkingModeChat: boolean | undefined;
};

export const llmConfig: LLMConfig = {
  providerLabel: llmEnv.LLM_PROVIDER,
  baseUrl: llmEnv.LLM_BASE_URL,
  apiKey: llmEnv.LLM_API_KEY,
  model: llmEnv.LLM_MODEL,
  providerLabelInsights: llmEnv.LLM_PROVIDER_INSIGHTS ?? llmEnv.LLM_PROVIDER,
  baseUrlInsights: llmEnv.LLM_BASE_URL_INSIGHTS ?? llmEnv.LLM_BASE_URL,
  modelInsights: llmEnv.LLM_MODEL_INSIGHTS ?? llmEnv.LLM_MODEL,
  apiKeyInsights: llmEnv.LLM_API_KEY_INSIGHTS ?? llmEnv.LLM_API_KEY,
  thinkingModeInsights:
    llmEnv.LLM_THINKING_MODE_INSIGHTS === undefined ? undefined : llmEnv.LLM_THINKING_MODE_INSIGHTS === "true",

  providerLabelEmbedding: llmEnv.LLM_PROVIDER_EMBEDDING ?? llmEnv.LLM_PROVIDER,
  baseUrlEmbedding: llmEnv.LLM_BASE_URL_EMBEDDING ?? llmEnv.LLM_BASE_URL,
  modelEmbedding: llmEnv.LLM_MODEL_EMBEDDING ?? llmEnv.LLM_MODEL,
  apiKeyEmbedding: llmEnv.LLM_API_KEY_EMBEDDING ?? llmEnv.LLM_API_KEY,
  embeddingDimensions: llmEnv.LLM_EMBEDDING_DIMENSIONS,

  providerLabelChat: llmEnv.LLM_PROVIDER_CHAT ?? llmEnv.LLM_PROVIDER,
  baseUrlChat: llmEnv.LLM_BASE_URL_CHAT ?? llmEnv.LLM_BASE_URL,
  modelChat: llmEnv.LLM_MODEL_CHAT ?? llmEnv.LLM_MODEL,
  apiKeyChat: llmEnv.LLM_API_KEY_CHAT ?? llmEnv.LLM_API_KEY,
  thinkingModeChat: llmEnv.LLM_THINKING_MODE_CHAT === undefined ? undefined : llmEnv.LLM_THINKING_MODE_CHAT === "true",
};
