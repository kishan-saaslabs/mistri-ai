import { stat } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import { audioMimeByExt, uploadRoot } from "../middleware/upload.js";
import { existsSync } from "node:fs";
import type { Request } from "express";
import { env } from "../config/env.js";
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

const mimeByExt: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "audio/webm",
};

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

function resolveStoredFile(storagePath: string): string {
  const name = basename(storagePath);
  if (!name || name !== storagePath.replaceAll("\\", "/").split("/").pop()) {
    throw new HttpError(404, "Recording not found");
  }
  const absolutePath = resolve(uploadRoot, name);
  const rel = relative(uploadRoot, absolutePath);
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new HttpError(404, "Recording not found");
  }
  if (!existsSync(absolutePath)) {
    throw new HttpError(404, "Recording not found");
  }
  return absolutePath;
}

function sanitizeDownloadName(raw: string | null, fallback: string): string {
  const base = basename(raw || fallback).replace(/[^\w.\-]+/g, "_");
  return base.slice(0, 120) || "recording";
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

async function transcriptionsForCall(call: CallRecord) {
  const transcriptions = await TranscriptionService.listForCall(call.id);
  if (call.status !== "LLM_SUCCESS") {
    return transcriptions;
  }

  const namedRows = await CallTranscriptModel.listByCallId(call.id);
  if (namedRows.length === 0) {
    return transcriptions;
  }

  const byTranscriptionId = new Map(
    namedRows.map((row) => [row.transcription_id, row]),
  );
  return transcriptions.map((row) => {
    const named = byTranscriptionId.get(row.id);
    if (!named) return row;
    return { ...row, segments: named.segments };
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
    const abs = safeUploadPath(call.storage_path);
    let fileStat;
    try {
      fileStat = await stat(abs);
    } catch {
      throw new HttpError(404, "Recording not found");
    }
    if (!fileStat.isFile()) {
      throw new HttpError(404, "Recording not found");
    }
    const ext = extname(abs).toLowerCase();
    const mime = audioMimeByExt[ext] ?? "application/octet-stream";
    const rawName = basename(call.filename || `recording${ext || ".bin"}`);
    const downloadName =
      rawName.replace(/[^\w.\-]+/g, "_").slice(0, 120) || `recording${ext}`;
    return { abs, size: fileStat.size, mime, downloadName };
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

  async createFromUpload(input: {
    originalName: string;
    storedName: string;
    dealId?: string | null;
    uploadedBy: string;
  }) {
    const actor = await loadActor(input.uploadedBy);
    await assertCanAssignDeal(actor, input.dealId);

    const filename = basename(input.originalName);
    const label =
      sanitizeLabel(filename.replace(/\.[^/.]+$/, "")) || "Uploaded call";

    const call = await CallModel.create({
      organizationId: actor.organization_id,
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy,
      label,
      filename,
      storagePath: input.storedName,
      status: "PROCESSING",
    });

    if (!call) {
      throw new HttpError(500, "Could not create call", false);
    }

    startTranscription(call.id);
    return call;
  },

  async recordingFile(actorId: string, id: string) {
    uuid.parse(id);
    const actor = await loadActor(actorId);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    await assertCallAccess(actor, call);
    if (!call.storage_path) {
      throw new HttpError(404, "Recording not found");
    }
    const absolutePath = resolveStoredFile(call.storage_path);
    const ext = extname(call.filename || call.storage_path).toLowerCase();
    return {
      absolutePath,
      mimeType: mimeByExt[ext] ?? "application/octet-stream",
      downloadName: sanitizeDownloadName(call.filename, call.storage_path),
    };
  },

  async createFromLink(
    input: z.infer<typeof linkCallSchema> & { uploadedBy: string },
  ) {
    const actor = await loadActor(input.uploadedBy);
    await assertCanAssignDeal(actor, input.dealId);

    const host = new URL(input.url).hostname.replace(/^www\./, "");
    const label = sanitizeLabel(input.label || `Linked call — ${host}`);

    return CallModel.create({
      organizationId: actor.organization_id,
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy,
      label,
      filename: input.url,
      sourceUrl: input.url,
      status: "PROCESSING",
    });
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
