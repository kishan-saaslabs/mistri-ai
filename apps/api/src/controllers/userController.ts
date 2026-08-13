import type { Request, Response } from "express";
import { requireUser } from "../middleware/auth.js";
import { addOrgUserSchema, UserService } from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const UserController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const result = await UserService.listOrganizationUsers(actor.id);
    res.json(result);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = addOrgUserSchema.parse(req.body);
    const result = await UserService.addToOrganization(actor.id, body);
    res.status(201).json(result);
  }),
};
