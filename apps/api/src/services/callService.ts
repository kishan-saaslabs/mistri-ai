import { basename } from "node:path";
import { z } from "zod";
import { CallModel, type CallRecord } from "../models/callModel.js";
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
  userId: z.string().uuid(),
});

function sanitizeLabel(raw: string) {
  return raw.replace(/[<>]/g, "").trim().slice(0, 200);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function loadActor(userId: string): Promise<UserRecord> {
  const user = await UserModel.findById(userId);
  if (!user || !isUserRole(user.role)) {
    throw new HttpError(401, "Authentication required");
  }
  return user;
}

async function assertDealAccess(actor: UserRecord, dealId: string): Promise<DealRecord> {
  uuid.parse(dealId);
  const deal = await DealModel.findById(dealId);
  if (!deal) {
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

async function assertCanAssignDeal(actor: UserRecord, dealId: string | null | undefined) {
  if (!dealId) return;
  uuid.parse(dealId);
  const deal = await DealModel.findById(dealId);
  if (!deal) {
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
    const message = error instanceof Error ? error.message : "Transcription failed";
    console.error("Transcription failed:", message);
  });
}

export const CallService = {
  async list(actorId: string) {
    const actor = await loadActor(actorId);
    if (canSeeAllDeals(actor.role)) {
      return CallModel.list();
    }
    return CallModel.listForUser(actor.id);
  },

  async listByDeal(actorId: string, dealId: string) {
    const actor = await loadActor(actorId);
    await assertDealAccess(actor, dealId);
    return CallModel.listByDeal(dealId);
  },

  async get(actorId: string, id: string) {
    uuid.parse(id);
    const actor = await loadActor(actorId);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    await assertCallAccess(actor, call);
    const transcriptions = await TranscriptionService.listForCall(id);
    return { call, transcriptions };
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
    const label = sanitizeLabel(filename.replace(/\.[^/.]+$/, "")) || "Uploaded call";

    const call = await CallModel.create({
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy,
      label,
      filename,
      storagePath: input.storedName,
      status: "processing",
    });

    if (!call) {
      throw new HttpError(500, "Could not create call", false);
    }

    startTranscription(call.id);
    return call;
  },

  async createFromLink(input: z.infer<typeof linkCallSchema> & { uploadedBy: string }) {
    const actor = await loadActor(input.uploadedBy);
    await assertCanAssignDeal(actor, input.dealId);

    const host = new URL(input.url).hostname.replace(/^www\./, "");
    const label = sanitizeLabel(input.label || `Linked call — ${host}`);

    return CallModel.create({
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy,
      label,
      filename: input.url,
      sourceUrl: input.url,
      status: "processing",
    });
  },
};

export const DealService = {
  async list(actorId: string) {
    const actor = await loadActor(actorId);
    if (canSeeAllDeals(actor.role)) {
      return DealModel.list();
    }
    return DealModel.listForUser(actor.id);
  },

  async create(name: string, createdBy: string) {
    await loadActor(createdBy);
    const deal = await DealModel.create({ name: sanitizeLabel(name), createdBy });
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
      role: row.role,
      createdAt: row.created_at,
    }));
  },

  async addUser(actorId: string, dealId: string, userId: string) {
    uuid.parse(dealId);
    uuid.parse(userId);
    const actor = await loadActor(actorId);
    const deal = await DealModel.findById(dealId);
    if (!deal) {
      throw new HttpError(404, "Deal not found");
    }
    if (!canShareDeal(actor, deal)) {
      throw new HttpError(403, "Forbidden");
    }

    const target = await UserModel.findById(userId);
    if (!target) {
      throw new HttpError(400, "User not found");
    }

    try {
      const membership = await UserDealModel.add(userId, dealId);
      if (!membership) {
        throw new HttpError(500, "Could not add user to deal", false);
      }
      return toPublicUser(target);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "User is already mapped to this deal");
      }
      throw error;
    }
  },
};
