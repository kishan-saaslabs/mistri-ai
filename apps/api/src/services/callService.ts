import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import {
  basename,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import type { Readable } from "node:stream";
import { z } from "zod";
import type { Request } from "express";
import { env } from "../config/env.js";
import {
  isAllowedAudioFile,
  mimeForAudio,
  sanitizeDownloadName,
} from "../lib/audioFile.js";
import { uploadRoot } from "../middleware/upload.js";
import { CallModel, type CallRecord } from "../models/callModel.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";
import { DealModel, type DealRecord } from "../models/dealModel.js";
import { UserDealModel } from "../models/userDealModel.js";
import {
  canSeeAllDeals,
  isUserRole,
  toPublicUser,
  type PublicUser,
  type UserRecord,
  UserModel,
} from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";
import {
  assertOwnedObjectKey,
  getObjectStream,
  headObject,
  isObjectKey,
  newObjectKey,
  objectStorage,
  presignPut,
  putFile,
} from "./objectStorage.js";
import { TranscriptionService } from "./transcriptionService.js";

const uuid = z.string().uuid();

export const createDealSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export const updateCallSchema = z.object({
  dealId: z.string().uuid().nullable(),
});

export const linkCallSchema = z.object({
  url: z.string().url().max(2048),
  dealId: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(200).optional(),
});

export const addDealUserSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

export const presignUploadSchema = z.object({
  filename: z.string().trim().min(1).max(240),
  contentType: z.string().trim().max(100).optional(),
  size: z.number().int().positive(),
  dealId: z.string().uuid().nullable().optional(),
});

export const completeUploadSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  filename: z.string().trim().min(1).max(240),
  dealId: z.string().uuid().nullable().optional(),
});

export type PublicCall = Omit<CallRecord, "storage_path"> & {
  fileUrl: string | null;
};

export function publicApiBase(req: Request): string {
  if (env.API_PUBLIC_URL) {
    return env.API_PUBLIC_URL;
  }
  const host = req.get("host") ?? `localhost:${env.API_PORT}`;
  return `${req.protocol}://${host}`;
}

export function toPublicCall(call: CallRecord, apiBaseUrl: string): PublicCall {
  const { storage_path: storagePath, ...rest } = call;
  const base = apiBaseUrl.replace(/\/$/, "");
  return {
    ...rest,
    fileUrl: storagePath
      ? `${base}/api/calls/${call.id}/file`
      : call.source_url,
  };
}

function sanitizeLabel(raw: string) {
  return raw.replace(/[<>]/g, "").trim().slice(0, 200);
}

function safeUploadPath(storedName: string) {
  const name = basename(storedName);
  if (!name || name === "." || name === "..") {
    throw new HttpError(404, "Recording not found");
  }
  const root = resolve(uploadRoot);
  const abs = resolve(root, name);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new HttpError(404, "Recording not found");
  }
  return abs;
}

export type RecordingSource = {
  size: number;
  mime: string;
  downloadName: string;
  open: (range?: { start: number; end: number }) => Promise<Readable>;
};

async function loadRecording(call: CallRecord): Promise<RecordingSource> {
  const storagePath = call.storage_path;
  if (!storagePath) {
    throw new HttpError(404, "Recording not found");
  }
  const downloadName = sanitizeDownloadName(call.filename, storagePath);
  const mime = mimeForAudio(call.filename || storagePath);

  if (isObjectKey(storagePath)) {
    const meta = await headObject(storagePath);
    return {
      size: meta.contentLength,
      mime: meta.contentType || mime,
      downloadName,
      open: async (range) => {
        const result = await getObjectStream(storagePath, range);
        return result.stream;
      },
    };
  }

  const abs = safeUploadPath(storagePath);
  let fileStat;
  try {
    fileStat = await stat(abs);
  } catch {
    throw new HttpError(404, "Recording not found");
  }
  if (!fileStat.isFile()) {
    throw new HttpError(404, "Recording not found");
  }
  return {
    size: fileStat.size,
    mime,
    downloadName,
    open: async (range) =>
      createReadStream(abs, range ? { start: range.start, end: range.end } : undefined),
  };
}

async function createStoredCall(input: {
  actor: UserRecord;
  filename: string;
  objectKey: string;
  dealId: string | null;
}) {
  const label =
    sanitizeLabel(input.filename.replace(/\.[^/.]+$/, "")) || "Uploaded call";
  const call = await CallModel.create({
    organizationId: input.actor.organization_id,
    dealId: input.dealId,
    uploadedBy: input.actor.id,
    label,
    filename: input.filename,
    storagePath: input.objectKey,
    status: "PROCESSING",
  });
  if (!call) {
    throw new HttpError(500, "Could not create call", false);
  }
  startTranscription(call.id);
  return call;
}

async function loadActor(userId: string): Promise<UserRecord> {
  const user = await UserModel.findById(userId);
  if (!user || !isUserRole(user.role) || !user.organization_id) {
    throw new HttpError(401, "Authentication required");
  }
  return user;
}

function sameOrg(
  actor: UserRecord,
  organizationId: string | null | undefined,
): boolean {
  return Boolean(organizationId) && actor.organization_id === organizationId;
}

async function assertDealAccess(
  actor: UserRecord,
  dealId: string,
): Promise<DealRecord> {
  uuid.parse(dealId);
  const deal = await DealModel.findById(dealId);
  if (!deal || !sameOrg(actor, deal.organization_id)) {
    throw new HttpError(404, "Deal not found");
  }
  if (canSeeAllDeals(actor.role)) {
    return deal;
  }
  const membership = await UserDealModel.find(actor.id, dealId);
  if (!membership) {
    throw new HttpError(403, "Forbidden");
  }
  return deal;
}

async function assertCanAssignDeal(
  actor: UserRecord,
  dealId: string | null | undefined,
) {
  if (!dealId) return;
  uuid.parse(dealId);
  const deal = await DealModel.findById(dealId);
  if (!deal || !sameOrg(actor, deal.organization_id)) {
    throw new HttpError(400, "Deal not found");
  }
  if (canSeeAllDeals(actor.role)) {
    return;
  }
  const membership = await UserDealModel.find(actor.id, dealId);
  if (!membership) {
    throw new HttpError(403, "Forbidden");
  }
}

function canShareDeal(actor: UserRecord, deal: DealRecord): boolean {
  return canSeeAllDeals(actor.role) || deal.created_by === actor.id;
}

async function assertCallAccess(actor: UserRecord, call: CallRecord) {
  if (!sameOrg(actor, call.organization_id)) {
    throw new HttpError(404, "Call not found");
  }
  if (canSeeAllDeals(actor.role)) {
    return;
  }
  if (!call.deal_id) {
    if (call.uploaded_by !== actor.id) {
      throw new HttpError(403, "Forbidden");
    }
    return;
  }
  const membership = await UserDealModel.find(actor.id, call.deal_id);
  if (!membership) {
    throw new HttpError(403, "Forbidden");
  }
}

function startTranscription(callId: string) {
  void TranscriptionService.transcribeCall(callId).catch((error) => {
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    console.error("Transcription failed:", message);
  });
}

function toPublicTranscription<T extends { provider_job_id?: string | null }>(row: T) {
  const { provider_job_id: _jobId, ...rest } = row;
  return rest;
}

function namedSegmentList(segments: unknown) {
  if (Array.isArray(segments)) {
    return segments;
  }
  return [];
}

async function transcriptionsForCall(call: CallRecord) {
  const transcriptions = await TranscriptionService.listForCall(call.id);
  const llmIds = transcriptions
    .filter((row) => row.status === "LLM_SUCCESS")
    .map((row) => row.id);

  const namedRows = await CallTranscriptModel.listByTranscriptionIds(llmIds);
  const byTranscriptionId = new Map(
    namedRows.map((row) => [String(row.transcription_id), row]),
  );

  return transcriptions.map((row) => {
    if (row.status !== "LLM_SUCCESS") {
      return toPublicTranscription(row);
    }
    const named = byTranscriptionId.get(String(row.id));
    if (!named) {
      return toPublicTranscription(row);
    }
    return toPublicTranscription({ ...row, segments: namedSegmentList(named.segments) });
  });
}

export const CallService = {
  async list(actorId: string) {
    const actor = await loadActor(actorId);
    if (canSeeAllDeals(actor.role)) {
      return CallModel.listForOrg(actor.organization_id);
    }
    return CallModel.listForUser(actor.id, actor.organization_id);
  },

  async listByDeal(actorId: string, dealId: string) {
    const actor = await loadActor(actorId);
    await assertDealAccess(actor, dealId);
    return CallModel.listByDeal(dealId, actor.organization_id);
  },

  async requireCall(actorId: string, id: string) {
    uuid.parse(id);
    const actor = await loadActor(actorId);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    await assertCallAccess(actor, call);
    return call;
  },

  async get(actorId: string, id: string) {
    const call = await CallService.requireCall(actorId, id);
    const transcriptions = await transcriptionsForCall(call);
    return { call, transcriptions };
  },

  async audioFile(actorId: string, id: string) {
    const call = await CallService.requireCall(actorId, id);
    if (!call.storage_path) {
      throw new HttpError(404, "No uploaded recording");
    }
    return loadRecording(call);
  },

  async recordingForProvider(id: string) {
    uuid.parse(id);
    const call = await CallModel.findById(id);
    if (!call?.storage_path) {
      throw new HttpError(404, "Recording not found");
    }
    return loadRecording(call);
  },

  async mapDeal(actorId: string, id: string, dealId: string | null) {
    uuid.parse(id);
    const actor = await loadActor(actorId);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    await assertCallAccess(actor, call);
    await assertCanAssignDeal(actor, dealId);
    const updated = await CallModel.updateDeal(id, dealId);
    if (!updated) {
      throw new HttpError(404, "Call not found");
    }
    return updated;
  },

  async presignUpload(
    actorId: string,
    input: z.infer<typeof presignUploadSchema>,
  ) {
    if (!objectStorage.isConfigured()) {
      throw new HttpError(503, "Object storage is not configured");
    }
    const actor = await loadActor(actorId);
    await assertCanAssignDeal(actor, input.dealId);
    if (!isAllowedAudioFile(input.filename, input.contentType)) {
      throw new HttpError(400, "Unsupported file type. Use MP3, WAV, M4A, or MP4.");
    }
    if (input.size > env.MAX_UPLOAD_BYTES) {
      throw new HttpError(413, "File too large");
    }

    const contentType = mimeForAudio(input.filename, input.contentType);
    const objectKey = newObjectKey(actor.organization_id, input.filename);
    const uploadUrl = await presignPut(objectKey, contentType);
    return {
      objectKey,
      uploadUrl,
      headers: { "Content-Type": contentType },
      expiresIn: env.S3_PRESIGN_PUT_EXPIRES_SECONDS,
    };
  },

  async completeUpload(
    actorId: string,
    input: z.infer<typeof completeUploadSchema>,
  ) {
    const actor = await loadActor(actorId);
    await assertCanAssignDeal(actor, input.dealId);
    if (!isAllowedAudioFile(input.filename)) {
      throw new HttpError(400, "Unsupported file type. Use MP3, WAV, M4A, or MP4.");
    }

    const objectKey = assertOwnedObjectKey(input.objectKey, actor.organization_id);
    const meta = await headObject(objectKey);
    if (meta.contentLength <= 0) {
      throw new HttpError(400, "Upload did not complete");
    }
    if (meta.contentLength > env.MAX_UPLOAD_BYTES) {
      throw new HttpError(413, "File too large");
    }

    return createStoredCall({
      actor,
      filename: basename(input.filename),
      objectKey,
      dealId: input.dealId ?? null,
    });
  },

  async createFromUpload(input: {
    originalName: string;
    storedPath: string;
    dealId?: string | null;
    uploadedBy: string;
    mimeType?: string;
  }) {
    const actor = await loadActor(input.uploadedBy);
    await assertCanAssignDeal(actor, input.dealId);
    if (!objectStorage.isConfigured()) {
      throw new HttpError(503, "Object storage is not configured");
    }
    if (!isAllowedAudioFile(input.originalName, input.mimeType)) {
      throw new HttpError(400, "Unsupported file type. Use MP3, WAV, M4A, or MP4.");
    }

    const filename = basename(input.originalName);
    const objectKey = newObjectKey(actor.organization_id, filename);
    try {
      await putFile(objectKey, input.storedPath, mimeForAudio(filename, input.mimeType));
    } finally {
      try {
        await unlink(input.storedPath);
      } catch {
        // temp upload already gone
      }
    }

    return createStoredCall({
      actor,
      filename,
      objectKey,
      dealId: input.dealId ?? null,
    });
  },

  async recordingFile(actorId: string, id: string) {
    const call = await CallService.requireCall(actorId, id);
    if (!call.storage_path) {
      throw new HttpError(404, "Recording not found");
    }
    return loadRecording(call);
  },

  async createFromLink(
    input: z.infer<typeof linkCallSchema> & { uploadedBy: string },
  ) {
    const actor = await loadActor(input.uploadedBy);
    await assertCanAssignDeal(actor, input.dealId);

    const host = new URL(input.url).hostname.replace(/^www\./, "");
    const label = sanitizeLabel(input.label || `Linked call — ${host}`);

    const call = await CallModel.create({
      organizationId: actor.organization_id,
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy,
      label,
      filename: input.url,
      sourceUrl: input.url,
      status: "PROCESSING",
    });
    if (!call) {
      throw new HttpError(500, "Could not create call", false);
    }
    startTranscription(call.id);
    return call;
  },
};

export const DealService = {
  async list(actorId: string) {
    const actor = await loadActor(actorId);
    if (canSeeAllDeals(actor.role)) {
      return DealModel.listForOrg(actor.organization_id);
    }
    return DealModel.listForUser(actor.id, actor.organization_id);
  },

  async create(name: string, createdBy: string) {
    const actor = await loadActor(createdBy);
    const deal = await DealModel.create({
      name: sanitizeLabel(name),
      createdBy,
      organizationId: actor.organization_id,
    });
    if (!deal) {
      throw new HttpError(500, "Could not create deal", false);
    }
    return deal;
  },

  async listUsers(actorId: string, dealId: string): Promise<PublicUser[]> {
    const actor = await loadActor(actorId);
    await assertDealAccess(actor, dealId);
    const members = await UserDealModel.listMembers(dealId);
    return members.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      org: row.org,
      organizationId: row.organization_id,
      role: row.role,
      createdAt: row.created_at,
    }));
  },

  async addUsers(actorId: string, dealId: string, userIds: string[]) {
    uuid.parse(dealId);
    const uniqueIds = [...new Set(userIds)];
    const actor = await loadActor(actorId);
    const deal = await DealModel.findById(dealId);
    if (!deal || !sameOrg(actor, deal.organization_id)) {
      throw new HttpError(404, "Deal not found");
    }
    if (!canShareDeal(actor, deal)) {
      throw new HttpError(403, "Forbidden");
    }

    const targets = await UserModel.findByIds(uniqueIds);
    if (
      targets.length !== uniqueIds.length ||
      targets.some((target) => !sameOrg(actor, target.organization_id))
    ) {
      throw new HttpError(400, "User not found");
    }

    await UserDealModel.addMany(uniqueIds, dealId);
    const byId = new Map(targets.map((target) => [target.id, target]));
    return uniqueIds.map((id) => toPublicUser(byId.get(id)!));
  },
};
