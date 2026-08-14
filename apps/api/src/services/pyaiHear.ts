import { env } from "../config/env.js";
import type { TranscriptSegment } from "../types/transcript.js";

export type PyaiTranscriptResult = {
  language: string | null;
  durationSeconds: number | null;
  fullText: string;
  segments: TranscriptSegment[];
};

const POLL_INTERVAL_MS = env.PYAI_POLL_INTERVAL_MS;
const POLL_TIMEOUT_MS = env.PYAI_POLL_TIMEOUT_MS;
const JOB_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

export class PyaiPollTimeoutError extends Error {
  constructor() {
    super("Transcription is still running at the provider");
    this.name = "PyaiPollTimeoutError";
  }
}

function sanitizeJobId(value: unknown): string {
  const raw = asString(value)?.trim() ?? "";
  if (!JOB_ID_RE.test(raw)) {
    throw new Error("PyAI did not return a valid job_id");
  }
  return raw;
}

function apiBase() {
  return env.PYAI_BASE_URL.replace(/\/$/, "");
}

function authHeaders(): { Authorization: string } {
  if (!env.PYAI_API_KEY) {
    throw new Error("PYAI_API_KEY is not configured");
  }
  return { Authorization: `Bearer ${env.PYAI_API_KEY}` };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function speakerLabel(row: Record<string, unknown>): string | null {
  if (typeof row.speaker === "string" && row.speaker.trim()) return row.speaker.trim();
  if (typeof row.speaker === "number" && Number.isFinite(row.speaker)) return `speaker_${row.speaker}`;
  if (typeof row.channel === "string" && row.channel.trim()) return row.channel.trim();
  if (typeof row.channel === "number" && Number.isFinite(row.channel)) return `channel_${row.channel}`;
  return null;
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  const root = asRecord(body);
  const nested = asRecord(root?.error);
  return asString(nested?.message) ?? asString(root?.error) ?? asString(root?.message) ?? fallback;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function pyaiRequest(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body = await readJson(res);
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        "PyAI rejected the file as too large (413). Hear must fetch it via audio_url — set S3_PUBLIC_ENDPOINT or PYAI_FETCH_BASE_URL to a public https origin.",
      );
    }
    throw new Error(errorMessageFromBody(body, `PyAI request failed (${res.status})`));
  }
  return body;
}

export function normalizeSegments(payload: unknown): TranscriptSegment[] {
  const root = asRecord(payload);
  const rawList = root && Array.isArray(root.segments)
    ? root.segments
    : root && Array.isArray(root.utterances)
      ? root.utterances
      : [];

  const mapped = rawList.flatMap((item, index): TranscriptSegment[] => {
    const row = asRecord(item);
    if (!row) return [];
    const text = asString(row.text)?.trim();
    if (!text) return [];
    return [
      {
        id: asString(row.id) ?? `seg_${index + 1}`,
        type: row.type === "partial" ? "partial" : "final",
        start: asNumber(row.start) ?? asNumber(row.offset_s),
        end: asNumber(row.end) ?? (
          asNumber(row.offset_s) != null && asNumber(row.duration_s) != null
            ? asNumber(row.offset_s)! + asNumber(row.duration_s)!
            : null
        ),
        speaker: speakerLabel(row),
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
      end: asNumber(root?.audio_seconds) ?? asNumber(root?.duration),
      speaker: null,
      text: fullText,
    },
  ];
}

type PyaiJob = {
  job_id?: string;
  status?: string;
  result?: unknown;
  result_url?: string;
  error?: string;
};

async function submitJob(input: {
  blob?: Blob;
  filename?: string;
  audioUrl?: string;
}): Promise<PyaiJob> {
  const headers = new Headers(authHeaders());
  headers.set("Idempotency-Key", crypto.randomUUID());

  let body: string | FormData;
  if (input.audioUrl) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({
      model: env.PYAI_TRANSCRIBE_MODEL,
      audio_url: input.audioUrl,
      channel: false,
      diarize: true,
      numerals: true,
      output_formats: ["json"],
    });
  } else if (input.blob) {
    const form = new FormData();
    form.set("model", env.PYAI_TRANSCRIBE_MODEL);
    form.set("diarize", "true");
    form.set("channel", "false");
    form.set("numerals", "true");
    form.set("output_formats", "json");
    form.set("audio", input.blob, input.filename ?? "call.mp3");
    body = form;
  } else {
    throw new Error("A recording file or audio URL is required");
  }

  const job = asRecord(await pyaiRequest(`${apiBase()}/v1/transcription/jobs`, {
    method: "POST",
    headers,
    body,
  }));

  if (!asString(job?.job_id)) {
    throw new Error("PyAI did not return a job_id");
  }
  return { ...job, job_id: sanitizeJobId(job?.job_id) } as PyaiJob;
}

async function waitForJob(jobId: string): Promise<PyaiJob> {
  const started = Date.now();
  const id = sanitizeJobId(jobId);
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const job = (await pyaiRequest(`${apiBase()}/v1/transcription/jobs/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })) as PyaiJob;

    if (job.status === "completed") return job;
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || `Transcription job ${job.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new PyaiPollTimeoutError();
}

async function resolveResult(job: PyaiJob): Promise<unknown> {
  if (job.result) return job.result;
  if (job.result_url) {
    let parsed: URL;
    try {
      parsed = new URL(job.result_url);
    } catch {
      throw new Error("Could not fetch transcription result");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Could not fetch transcription result");
    }
    const res = await fetch(parsed);
    const body = await readJson(res);
    if (!res.ok) {
      throw new Error(errorMessageFromBody(body, "Could not fetch transcription result"));
    }
    return body;
  }
  throw new Error("Completed job had neither result nor result_url");
}

function toTranscriptResult(payload: unknown): PyaiTranscriptResult {
  const root = asRecord(payload);
  const segments = normalizeSegments(payload);
  const fullText =
    asString(root?.text)?.trim() ||
    segments.map((seg) => seg.text).join(" ").trim();

  return {
    language: asString(root?.language) ?? "en",
    durationSeconds: asNumber(root?.audio_seconds) ?? asNumber(root?.duration),
    fullText,
    segments,
  };
}

export async function finishPyaiJob(jobId: string): Promise<PyaiTranscriptResult> {
  const job = await waitForJob(jobId);
  const payload = await resolveResult(job);
  return toTranscriptResult(payload);
}

export async function transcribeAudioFile(
  input: {
    filename: string;
    mimeType: string;
    audioUrl?: string;
    blob?: Blob;
  },
  hooks?: {
    onJobSubmitted?: (jobId: string) => Promise<void> | void;
  },
): Promise<PyaiTranscriptResult> {
  const submitted = await submitJob({
    blob: input.blob,
    filename: input.filename,
    audioUrl: input.audioUrl,
  });

  const jobId = sanitizeJobId(submitted.job_id);
  await hooks?.onJobSubmitted?.(jobId);

  const job = await waitForJob(jobId);
  const payload = await resolveResult(job);
  return toTranscriptResult(payload);
}
