import { randomUUID } from "node:crypto";
import { createWriteStream, openAsBlob } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { audioExtOf } from "../lib/audioFile.js";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OBJECT_KEY_RE = new RegExp(
  String.raw`^org/(${UUID_RE})/calls/(${UUID_RE})\.(mp3|wav|m4a|mp4|webm)$`,
  "i",
);

function optionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : undefined;
}

function isConfigured(): boolean {
  return Boolean(env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_BUCKET);
}

function requireConfig() {
  if (!isConfigured()) {
    throw new HttpError(503, "Object storage is not configured", false);
  }
}

function s3Client(endpoint: string): S3Client {
  requireConfig();
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function internalClient(): S3Client {
  return s3Client(env.S3_ENDPOINT);
}

function browserEndpoint(): string {
  return optionalUrl(env.S3_BROWSER_ENDPOINT) ?? env.S3_ENDPOINT;
}

function providerEndpoint(): string {
  return optionalUrl(env.S3_PUBLIC_ENDPOINT) ?? env.S3_ENDPOINT;
}

export function isObjectKey(storagePath: string): boolean {
  return storagePath.startsWith("org/");
}

export function newObjectKey(organizationId: string, filename: string): string {
  const ext = audioExtOf(filename);
  const safeExt = ext.replace(".", "");
  return `org/${organizationId}/calls/${randomUUID()}.${safeExt}`;
}

export function assertOwnedObjectKey(objectKey: string, organizationId: string): string {
  const match = OBJECT_KEY_RE.exec(objectKey);
  if (match?.[1] !== organizationId) {
    throw new HttpError(400, "Invalid upload");
  }
  return objectKey;
}

export function pyaiCanFetchUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  if (
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function corsOrigins(): string[] {
  const origins = new Set([env.CORS_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"]);
  return [...origins];
}

export async function ensureObjectStorage(): Promise<void> {
  if (!isConfigured()) {
    console.warn("S3 is not configured; call uploads will fail until S3_* is set in .env.");
    return;
  }

  const client = internalClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      }
      try {
        await client.send(
          new PutBucketCorsCommand({
            Bucket: env.S3_BUCKET,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ["*"],
                  AllowedMethods: ["GET", "PUT", "HEAD"],
                  AllowedOrigins: corsOrigins(),
                  ExposeHeaders: ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
                  MaxAgeSeconds: 3600,
                },
              ],
            },
          }),
        );
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name !== "NotImplemented") {
          throw error;
        }
      }
      if (!pyaiCanFetchUrl(`${providerEndpoint()}/health`) && !pyaiCanFetchUrl(`${env.PYAI_FETCH_BASE_URL ?? ""}/`)) {
        console.warn(
          "PyAI cannot fetch local MinIO. For large recordings set S3_PUBLIC_ENDPOINT or PYAI_FETCH_BASE_URL to a public https origin.",
        );
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const name = lastError instanceof Error ? lastError.name : "Error";
  console.error("Could not reach object storage:", name);
}

export async function putFile(objectKey: string, absolutePath: string, contentType: string): Promise<void> {
  const client = internalClient();
  const { createReadStream } = await import("node:fs");
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      Body: createReadStream(absolutePath),
      ContentType: contentType,
    }),
  );
}

export type ObjectMeta = {
  contentLength: number;
  contentType: string | undefined;
};

export async function headObject(objectKey: string): Promise<ObjectMeta> {
  const client = internalClient();
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
      }),
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType,
    };
  } catch {
    throw new HttpError(404, "Recording not found");
  }
}

function rangeHeader(range?: { start: number; end: number }): string | undefined {
  if (!range) return undefined;
  return `bytes=${range.start}-${range.end}`;
}

function asNodeReadable(body: GetObjectCommandOutput["Body"]): Readable {
  if (!body) {
    throw new HttpError(404, "Recording not found");
  }
  if (body instanceof Readable) return body;
  if (typeof body === "object" && "transformToWebStream" in body) {
    return Readable.fromWeb(
      (body as { transformToWebStream: () => ReadableStream }).transformToWebStream() as Parameters<
        typeof Readable.fromWeb
      >[0],
    );
  }
  throw new HttpError(500, "Could not read recording", false);
}

export async function getObjectStream(
  objectKey: string,
  range?: { start: number; end: number },
): Promise<{ stream: Readable; contentLength: number; contentRange?: string; contentType?: string }> {
  const client = internalClient();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Range: rangeHeader(range),
      }),
    );
    return {
      stream: asNodeReadable(result.Body),
      contentLength: result.ContentLength ?? 0,
      contentRange: result.ContentRange,
      contentType: result.ContentType,
    };
  } catch {
    throw new HttpError(404, "Recording not found");
  }
}

export async function presignPut(objectKey: string, contentType: string): Promise<string> {
  const client = s3Client(browserEndpoint());
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: env.S3_PRESIGN_PUT_EXPIRES_SECONDS },
  );
}

export async function presignGetForProvider(objectKey: string): Promise<string> {
  const client = s3Client(providerEndpoint());
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
    }),
    { expiresIn: env.S3_PRESIGN_GET_EXPIRES_SECONDS },
  );
}

export async function materializeObjectBlob(
  objectKey: string,
  mimeType: string,
): Promise<{ blob: Blob; cleanup: () => Promise<void> }> {
  const tmpPath = join(tmpdir(), `mistri-hear-${randomUUID()}`);
  const { stream } = await getObjectStream(objectKey);
  await pipeline(stream, createWriteStream(tmpPath));
  const blob = await openAsBlob(tmpPath, { type: mimeType });
  return {
    blob,
    cleanup: async () => {
      try {
        await unlink(tmpPath);
      } catch {
        // temp file already gone
      }
    },
  };
}

export const objectStorage = {
  isConfigured,
  ensureReady: ensureObjectStorage,
};
