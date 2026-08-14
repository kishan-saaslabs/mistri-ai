import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

function signingSecret(): string {
  return env.JWT_SECRET;
}

export function signProviderAudio(callId: string, expiresAt: number): string {
  return createHmac("sha256", signingSecret()).update(`${callId}.${expiresAt}`).digest("base64url");
}

export function verifyProviderAudio(callId: string, expiresAtRaw: string, sig: string): boolean {
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 < Date.now()) {
    return false;
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(sig)) {
    return false;
  }
  const expected = signProviderAudio(callId, expiresAt);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function providerAudioUrl(publicBase: string, callId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + env.S3_PRESIGN_GET_EXPIRES_SECONDS;
  const sig = signProviderAudio(callId, expiresAt);
  const base = publicBase.replace(/\/$/, "");
  return `${base}/api/calls/${encodeURIComponent(callId)}/provider-audio?e=${expiresAt}&s=${sig}`;
}
