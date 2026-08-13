import { basename } from "node:path";
import { z } from "zod";
import { CallModel, emptyAnalysis } from "../models/callModel.js";
import { DealModel } from "../models/dealModel.js";
import { RepModel } from "../models/repModel.js";
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
  repId: z.string().uuid(),
  dealId: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(200).optional(),
});

function sanitizeLabel(raw: string) {
  return raw.replace(/[<>]/g, "").trim().slice(0, 200);
}

export const CallService = {
  list() {
    return CallModel.list();
  },

  async get(id: string) {
    uuid.parse(id);
    const call = await CallModel.findById(id);
    if (!call) {
      throw new HttpError(404, "Call not found");
    }
    return call;
  },

  async mapDeal(id: string, dealId: string | null) {
    uuid.parse(id);
    if (dealId) {
      const deal = await DealModel.findById(dealId);
      if (!deal) {
        throw new HttpError(400, "Deal not found");
      }
    }
    const updated = await CallModel.updateDeal(id, dealId);
    if (!updated) {
      throw new HttpError(404, "Call not found");
    }
    return updated;
  },

  async createFromUpload(input: {
    originalName: string;
    storedName: string;
    repId: string;
    dealId?: string | null;
  }) {
    uuid.parse(input.repId);
    const rep = await RepModel.findById(input.repId);
    if (!rep) {
      throw new HttpError(400, "Rep not found");
    }
    if (input.dealId) {
      uuid.parse(input.dealId);
      const deal = await DealModel.findById(input.dealId);
      if (!deal) {
        throw new HttpError(400, "Deal not found");
      }
    }

    const filename = basename(input.originalName);
    const label = sanitizeLabel(filename.replace(/\.[^/.]+$/, "")) || "Uploaded call";

    return CallModel.create({
      dealId: input.dealId ?? null,
      repId: input.repId,
      label,
      filename,
      storagePath: input.storedName,
      status: "processing",
      statusColor: "neutral",
      verdict: "Processing",
      analysis: emptyAnalysis(),
    });
  },

  async createFromLink(input: z.infer<typeof linkCallSchema>) {
    const rep = await RepModel.findById(input.repId);
    if (!rep) {
      throw new HttpError(400, "Rep not found");
    }
    if (input.dealId) {
      const deal = await DealModel.findById(input.dealId);
      if (!deal) {
        throw new HttpError(400, "Deal not found");
      }
    }

    const host = new URL(input.url).hostname.replace(/^www\./, "");
    const label = sanitizeLabel(input.label || `Linked call — ${host}`);

    return CallModel.create({
      dealId: input.dealId ?? null,
      repId: input.repId,
      label,
      filename: input.url,
      sourceUrl: input.url,
      status: "processing",
      statusColor: "neutral",
      verdict: "Processing",
      analysis: emptyAnalysis(),
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

export const RepService = {
  list() {
    return RepModel.list();
  },
};
