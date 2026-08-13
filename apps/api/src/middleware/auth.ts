import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { isUserRole, type UserRole } from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { email: user.email, role: user.role } satisfies Omit<AccessTokenPayload, "sub">,
    env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions,
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      !isUserRole(payload.role)
    ) {
      next(new HttpError(401, "Invalid token"));
      return;
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }
  return req.user;
}
