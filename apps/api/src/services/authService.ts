import bcrypt from "bcryptjs";
import { z } from "zod";
import { signAccessToken } from "../middleware/auth.js";
import {
  DEFAULT_USER_ROLE,
  isUserRole,
  toPublicUser,
  USER_ROLES,
  UserModel,
} from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

const BCRYPT_ROUNDS = 12;

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(120),
  org: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).nullish(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

export const AuthService = {
  async register(input: z.infer<typeof registerSchema>) {
    const existing = await UserModel.findByEmail(input.email);
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await UserModel.create({
      email: input.email,
      passwordHash,
      name: input.name,
      org: input.org,
      role: input.role ?? DEFAULT_USER_ROLE,
    });

    if (!user || !isUserRole(user.role)) {
      throw new HttpError(500, "Could not create user", false);
    }

    const publicUser = toPublicUser(user);
    return {
      user: publicUser,
      token: signAccessToken({
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
      }),
    };
  },

  async login(input: z.infer<typeof loginSchema>) {
    const user = await UserModel.findByEmail(input.email);
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    const ok = await bcrypt.compare(input.password, user.password_hash);
    if (!ok) {
      throw new HttpError(401, "Invalid email or password");
    }

    if (!isUserRole(user.role)) {
      throw new HttpError(500, "Could not sign in", false);
    }

    const publicUser = toPublicUser(user);
    return {
      user: publicUser,
      token: signAccessToken({
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
      }),
    };
  },
};
