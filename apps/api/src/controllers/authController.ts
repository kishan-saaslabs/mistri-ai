import type { Request, Response } from "express";
import { clearAccessTokenCookie, setAccessTokenCookie } from "../middleware/auth.js";
import { UserModel, toPublicUser } from "../models/userModel.js";
import {
  AuthService,
  loginSchema,
  registerSchema,
} from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

export const AuthController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const body = registerSchema.parse(req.body);
    const result = await AuthService.register(body);
    setAccessTokenCookie(res, result.token);
    res.status(201).json(result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const body = loginSchema.parse(req.body);
    const result = await AuthService.login(body);
    setAccessTokenCookie(res, result.token);
    res.json(result);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      throw new HttpError(401, "Authentication required");
    }
    res.json({ user: toPublicUser(user) });
  }),

  logout: asyncHandler(async (_req: Request, res: Response) => {
    clearAccessTokenCookie(res);
    res.status(204).send();
  }),
};
