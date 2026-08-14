import { basename, extname } from "node:path";

export const ALLOWED_AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".mp4", ".webm"]);

export const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "video/mp4",
]);

export const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "audio/webm",
};

export function audioExtOf(filename: string): string {
  return extname(filename).toLowerCase();
}

export function isAllowedAudioFile(filename: string, mimeType?: string): boolean {
  const ext = audioExtOf(filename);
  if (ALLOWED_AUDIO_EXT.has(ext)) return true;
  return Boolean(mimeType && ALLOWED_AUDIO_MIME.has(mimeType));
}

export function mimeForAudio(filename: string, mimeType?: string): string {
  const ext = audioExtOf(filename);
  if (ext && AUDIO_MIME_BY_EXT[ext]) return AUDIO_MIME_BY_EXT[ext];
  if (mimeType && ALLOWED_AUDIO_MIME.has(mimeType)) return mimeType;
  return "application/octet-stream";
}

export function sanitizeDownloadName(raw: string | null | undefined, fallback: string): string {
  const base = basename(raw || fallback).replace(/[^\w.\-]+/g, "_");
  return base.slice(0, 120) || "recording";
}
