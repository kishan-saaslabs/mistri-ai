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

const envSchema = z.object({
  LLM_PROVIDER: z.string().min(1).default("nvidia"),
  LLM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  LLM_API_KEY: z
    .string()
    .max(512)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  LLM_MODEL: z.string().min(1).default("meta/llama-3.1-8b-instruct"),
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
};

export const llmConfig: LLMConfig = {
  providerLabel: llmEnv.LLM_PROVIDER,
  baseUrl: llmEnv.LLM_BASE_URL,
  apiKey: llmEnv.LLM_API_KEY,
  model: llmEnv.LLM_MODEL,
};
