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
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres connection string",
    ),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return undefined;
      return trimmed.replace(/\/$/, "");
    })
    .refine((value) => value === undefined || value.startsWith("http://") || value.startsWith("https://"), {
      message: "API_PUBLIC_URL must be an http(s) origin",
    }),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(512 * 1024 * 1024),
  S3_ENDPOINT: z
    .string()
    .default("http://localhost:9000")
    .transform((value) => value.trim().replace(/\/$/, "")),
  S3_BROWSER_ENDPOINT: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : undefined;
    }),
  S3_PUBLIC_ENDPOINT: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : undefined;
    }),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("mistri-calls"),
  S3_ACCESS_KEY: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  S3_SECRET_KEY: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    })
    .refine((value) => value === undefined || value.length >= 8, {
      message: "S3_SECRET_KEY must be at least 8 characters",
    }),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  S3_PRESIGN_PUT_EXPIRES_SECONDS: z.coerce.number().int().positive().max(7 * 24 * 60 * 60).default(15 * 60),
  S3_PRESIGN_GET_EXPIRES_SECONDS: z.coerce.number().int().positive().max(7 * 24 * 60 * 60).default(2 * 60 * 60),
  PYAI_FETCH_BASE_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return undefined;
      return trimmed.replace(/\/$/, "");
    })
    .refine((value) => value === undefined || value.startsWith("https://"), {
      message: "PYAI_FETCH_BASE_URL must be an https origin PyAI can reach",
    }),
  PYAI_API_KEY: z
    .string()
    .max(512)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  PYAI_BASE_URL: z.string().url().default("https://api.pyai.com"),
  PYAI_TRANSCRIBE_MODEL: z.string().min(1).default("pyai-hear-telephony"),
  PYAI_POLL_TIMEOUT_MS: z.coerce.number().int().positive().max(6 * 60 * 60 * 1000).default(30 * 60 * 1000),
  PYAI_POLL_INTERVAL_MS: z.coerce.number().int().positive().min(500).max(30_000).default(2_000),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  QUEUE_INFER_AND_RENAME_NAME: z.string().min(1).default("infer-and-rename"),
  QUEUE_CALL_INSIGHTS_NAME: z.string().min(1).default("call-insights"),
  QUEUE_KB_INGEST_NAME: z.string().min(1).default("kb-ingest"),
});

const parsed = envSchema
  .refine((value) => Boolean(value.S3_ACCESS_KEY) === Boolean(value.S3_SECRET_KEY), {
    message: "S3_ACCESS_KEY and S3_SECRET_KEY must both be set",
    path: ["S3_ACCESS_KEY"],
  })
  .safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
