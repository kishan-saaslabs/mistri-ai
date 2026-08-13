import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../config/env.js";
import { isUserRole, type UserRole } from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ACCESS_TOKEN_COOKIE = "access_token";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function expiresInToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/i.exec(value.trim());
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

function accessTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: expiresInToMs(env.JWT_EXPIRES_IN),
  };
}

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, accessTokenCookieOptions());
}

export function clearAccessTokenCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = accessTokenCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }
    let value = part.slice(separator + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const bearer = header.slice("Bearer ".length).trim();
    if (bearer) {
      return bearer;
    }
  }
  return readCookie(req.headers.cookie, ACCESS_TOKEN_COOKIE);
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
  const token = readAccessToken(req);
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
