import type { Request, Response } from "express";
import { requireUser } from "../middleware/auth.js";
import {
  CallService,
  DealService,
  addDealUserSchema,
  createDealSchema,
  linkCallSchema,
  updateCallSchema,
} from "../services/callService.js";
import { publishInferAndRenameJob } from "../queue/inferAndRenameQueue.js";
import { TranscriptionService } from "../services/transcriptionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

export const DealController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    res.json({ deals: await DealService.list(actor.id) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = createDealSchema.parse(req.body);
    const deal = await DealService.create(body.name, actor.id);
    res.status(201).json({ deal });
  }),

  listCalls: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const calls = await CallService.listByDeal(actor.id, String(req.params.id));
    res.json({ calls });
  }),

  listUsers: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const users = await DealService.listUsers(actor.id, String(req.params.id));
    res.json({ users });
  }),

  addUser: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = addDealUserSchema.parse(req.body);
    const users = await DealService.addUsers(actor.id, String(req.params.id), body.userIds);
    res.status(201).json({ users });
  }),
};

export const CallController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    res.json({ calls: await CallService.list(actor.id) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const result = await CallService.get(actor.id, String(req.params.id));
    res.json(result);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = updateCallSchema.parse(req.body);
    const call = await CallService.mapDeal(actor.id, String(req.params.id), body.dealId);
    res.json({ call });
  }),

  upload: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    if (!req.file) {
      throw new HttpError(400, "A recording file is required");
    }
    const dealId =
      typeof req.body.dealId === "string" && req.body.dealId.length > 0 ? req.body.dealId : null;
    const call = await CallService.createFromUpload({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      dealId,
      uploadedBy: actor.id,
    });
    res.status(201).json({ call });
  }),

  link: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = linkCallSchema.parse(req.body);
    const call = await CallService.createFromLink({ ...body, uploadedBy: actor.id });
    res.status(201).json({ call });
  }),

  transcriptions: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const result = await CallService.get(actor.id, String(req.params.id));
    res.json({ transcriptions: result.transcriptions });
  }),

  retranscribe: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const result = await CallService.get(actor.id, String(req.params.id));
    if (!result.call.storage_path) {
      throw new HttpError(400, "Call has no uploaded file to transcribe");
    }
    await TranscriptionService.transcribeCall(result.call.id);
    const refreshed = await CallService.get(actor.id, result.call.id);
    res.json(refreshed);
  }),

  inferAndRename: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const result = await CallService.get(actor.id, String(req.params.id));
    const transcription = result.transcriptions[0];

    if (!transcription) {
      throw new HttpError(400, "Call has no transcription to infer speakers from");
    }
    if (transcription.status !== "ready") {
      throw new HttpError(409, "Transcription is not ready yet");
    }

    await publishInferAndRenameJob({ callId: result.call.id, transcriptionId: transcription.id });
    res.status(202).json({ status: "queued", transcriptionId: transcription.id });
  }),
};
