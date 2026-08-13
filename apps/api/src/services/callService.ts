import { basename } from "node:path";
import { z } from "zod";
import { CallModel } from "../models/callModel.js";
import { DealModel } from "../models/dealModel.js";
import { TranscriptionService } from "./transcriptionService.js";
import { HttpError } from "../utils/httpError.js";

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

function sanitizeLabel(raw: string) {
  return raw.replace(/[<>]/g, "").trim().slice(0, 200);
}

async function assertDeal(dealId: string | null | undefined) {
  if (!dealId) return;
  uuid.parse(dealId);
  const deal = await DealModel.findById(dealId);
  if (!deal) {
    throw new HttpError(400, "Deal not found");
  }
}

function startTranscription(callId: string) {
  void TranscriptionService.transcribeCall(callId).catch((error) => {
    const message = error instanceof Error ? error.message : "Transcription failed";
    console.error("Transcription failed:", message);
  });
}

export const CallService = {
  list() {
    return CallModel.list();
  },

  async listByDeal(dealId: string) {
    uuid.parse(dealId);
    await assertDeal(dealId);
    return CallModel.listByDeal(dealId);
  },

  async get(id: string) {
    uuid.parse(id);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    const transcriptions = await TranscriptionService.listForCall(id);
    return { call, transcriptions };
  },

  async mapDeal(id: string, dealId: string | null) {
    uuid.parse(id);
    await assertDeal(dealId);
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
    uploadedBy?: string | null;
  }) {
    await assertDeal(input.dealId);

    const filename = basename(input.originalName);
    const label = sanitizeLabel(filename.replace(/\.[^/.]+$/, "")) || "Uploaded call";

    const call = await CallModel.create({
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy ?? null,
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

  async createFromLink(input: z.infer<typeof linkCallSchema> & { uploadedBy?: string | null }) {
    await assertDeal(input.dealId);

    const host = new URL(input.url).hostname.replace(/^www\./, "");
    const label = sanitizeLabel(input.label || `Linked call — ${host}`);

    return CallModel.create({
      dealId: input.dealId ?? null,
      uploadedBy: input.uploadedBy ?? null,
      label,
      filename: input.url,
      sourceUrl: input.url,
      status: "processing",
    });
  },
};

export const DealService = {
  list() {
    return DealModel.list();
  },

  async create(name: string, createdBy?: string) {
    return DealModel.create({ name: sanitizeLabel(name), createdBy });
  },
};
