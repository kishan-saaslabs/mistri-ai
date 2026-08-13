import type { Request, Response } from "express";
import { CallService, DealService, RepService, createDealSchema, linkCallSchema, updateCallSchema } from "../services/callService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

export const RepController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ reps: await RepService.list() });
  }),
};

export const DealController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ deals: await DealService.list() });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const body = createDealSchema.parse(req.body);
    const deal = await DealService.create(body.name, req.user?.id);
    res.status(201).json({ deal });
  }),
};

export const CallController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ calls: await CallService.list() });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const call = await CallService.get(String(req.params.id));
    res.json({ call });
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
    const repId = typeof req.body.repId === "string" ? req.body.repId : "";
    const dealId =
      typeof req.body.dealId === "string" && req.body.dealId.length > 0 ? req.body.dealId : null;
    const call = await CallService.createFromUpload({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      repId,
      dealId,
    });
    res.status(201).json({ call });
  }),

  link: asyncHandler(async (req: Request, res: Response) => {
    const body = linkCallSchema.parse(req.body);
    const call = await CallService.createFromLink(body);
    res.status(201).json({ call });
  }),
};
