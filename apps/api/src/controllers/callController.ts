import type { Request, Response } from "express";
import { CallService, DealService, createDealSchema, linkCallSchema, updateCallSchema } from "../services/callService.js";
import { TranscriptionService } from "../services/transcriptionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

export const DealController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ deals: await DealService.list() });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const body = createDealSchema.parse(req.body);
    const deal = await DealService.create(body.name, req.user?.id);
    res.status(201).json({ deal });
  }),

  listCalls: asyncHandler(async (req: Request, res: Response) => {
    const calls = await CallService.listByDeal(String(req.params.id));
    res.json({ calls });
  }),
};

export const CallController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ calls: await CallService.list() });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const result = await CallService.get(String(req.params.id));
    res.json(result);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const body = updateCallSchema.parse(req.body);
    const call = await CallService.mapDeal(String(req.params.id), body.dealId);
    res.json({ call });
  }),

  upload: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new HttpError(400, "A recording file is required");
    }
    const dealId =
      typeof req.body.dealId === "string" && req.body.dealId.length > 0 ? req.body.dealId : null;
    const call = await CallService.createFromUpload({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      dealId,
      uploadedBy: req.user?.id ?? null,
    });
    res.status(201).json({ call });
  }),

  link: asyncHandler(async (req: Request, res: Response) => {
    const body = linkCallSchema.parse(req.body);
    const call = await CallService.createFromLink({ ...body, uploadedBy: req.user?.id ?? null });
    res.status(201).json({ call });
  }),

  transcriptions: asyncHandler(async (req: Request, res: Response) => {
    const result = await CallService.get(String(req.params.id));
    res.json({ transcriptions: result.transcriptions });
  }),

  retranscribe: asyncHandler(async (req: Request, res: Response) => {
    const result = await CallService.get(String(req.params.id));
    if (!result.call.storage_path) {
      throw new HttpError(400, "Call has no uploaded file to transcribe");
    }
    await TranscriptionService.transcribeCall(result.call.id);
    const refreshed = await CallService.get(result.call.id);
    res.json(refreshed);
  }),
};
