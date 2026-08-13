import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { isUserRole, type UserRole } from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
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
  organization_id: string;
};

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      organization_id: user.organizationId,
    } satisfies Omit<AccessTokenPayload, "sub">,
    env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions,
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
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
      !isUserRole(payload.role) ||
      !isUuid(payload.organization_id)
    ) {
      next(new HttpError(401, "Invalid token"));
      return;
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organization_id,
    };
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
