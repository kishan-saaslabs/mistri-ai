import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import PyAI from "@pyai/sdk";
import { env } from "../config/env.js";
import type { TranscriptSegment } from "../types/transcript.js";

export type PyaiTranscriptResult = {
  language: string | null;
  durationSeconds: number | null;
  fullText: string;
  segments: TranscriptSegment[];
};

function getClient() {
  if (!env.PYAI_API_KEY) {
    throw new Error("PYAI_API_KEY is not configured");
  }
  return new PyAI({
    apiKey: env.PYAI_API_KEY,
    baseURL: env.PYAI_BASE_URL,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function normalizeSegments(payload: unknown): TranscriptSegment[] {
  const root = asRecord(payload);
  const rawSegments = root && Array.isArray(root.segments) ? root.segments : [];

  const mapped = rawSegments.flatMap((item, index): TranscriptSegment[] => {
    const row = asRecord(item);
    if (!row) return [];
    const text = asString(row.text)?.trim();
    if (!text) return [];
    return [
      {
        id: asString(row.id) ?? `seg_${index + 1}`,
        type: row.type === "partial" ? "partial" : "final",
        start: asNumber(row.start),
        end: asNumber(row.end),
        speaker: asString(row.speaker),
        text,
      },
    ];
  });

  if (mapped.length > 0) {
    return mapped;
  }

  const fullText = asString(root?.text)?.trim();
  if (!fullText) {
    return [];
  }

  return [
    {
      id: "seg_1",
      type: "final",
      start: 0,
      end: asNumber(root?.duration),
      speaker: null,
      text: fullText,
    },
  ];
}

export async function transcribeAudioFile(input: {
  absolutePath: string;
  filename: string;
  mimeType: string;
}): Promise<PyaiTranscriptResult> {
  const pyai = getClient();
  const bytes = await readFile(input.absolutePath);
  const file = new File([bytes], input.filename, { type: input.mimeType });

  const result = await pyai.audio.transcriptions.create({
    file,
    filename: input.filename,
    model: env.PYAI_TRANSCRIBE_MODEL,
    language: "en",
    response_format: "verbose_json",
  });

  console.log("PyAI response:", result);

  const payload = result as unknown;
  const root = asRecord(payload);
  const segments = normalizeSegments(payload);
  const fullText =
    asString(root?.text)?.trim() ||
    segments
      .map((seg) => seg.text)
      .join(" ")
      .trim();

  return {
    language: asString(root?.language) ?? "en",
    durationSeconds: asNumber(root?.duration),
    fullText,
    segments,
  };
}
