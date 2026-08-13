import bcrypt from "bcryptjs";
import { z } from "zod";
import { signAccessToken } from "../middleware/auth.js";
import { toPublicUser, UserModel } from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

const BCRYPT_ROUNDS = 12;

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(120),
  org: z.string().trim().max(120).optional(),
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
    });

    if (!user) {
      throw new HttpError(500, "Could not create user", false);
    }

    const publicUser = toPublicUser(user);
    return {
      user: publicUser,
      token: signAccessToken({ id: publicUser.id, email: publicUser.email }),
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

    const publicUser = toPublicUser(user);
    return {
      user: publicUser,
      token: signAccessToken({ id: publicUser.id, email: publicUser.email }),
    };
  },
};
