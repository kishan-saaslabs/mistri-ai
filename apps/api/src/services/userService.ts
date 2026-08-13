import bcrypt from "bcryptjs";
import { z } from "zod";
import { OrganizationModel } from "../models/organizationModel.js";
import {
  canAssignRole,
  canManageOrgUsers,
  isUserRole,
  toPublicUser,
  USER_ROLES,
  UserModel,
  type UserRole,
} from "../models/userModel.js";
import { HttpError } from "../utils/httpError.js";

const BCRYPT_ROUNDS = 12;

export const addOrgUserSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
  role: z.enum(USER_ROLES).nullish(),
});

export const UserService = {
  async listOrganizationUsers(actorId: string) {
    const actor = await UserModel.findById(actorId);
    if (!actor || !isUserRole(actor.role) || !actor.organization_id) {
      throw new HttpError(401, "Authentication required");
    }
    const users = await UserModel.listByOrganization(actor.organization_id);
    return { users: users.map(toPublicUser) };
  },

  async addToOrganization(actorId: string, input: z.infer<typeof addOrgUserSchema>) {
    const actor = await UserModel.findById(actorId);
    if (!actor || !isUserRole(actor.role) || !actor.organization_id) {
      throw new HttpError(401, "Authentication required");
    }
    if (!canManageOrgUsers(actor.role)) {
      throw new HttpError(403, "Forbidden");
    }

    const role: UserRole = input.role ?? "TEAM_MEMBER";
    if (!canAssignRole(actor.role, role)) {
      throw new HttpError(403, "Forbidden");
    }

    const existing = await UserModel.findByEmail(input.email);
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const organization = await OrganizationModel.findById(actor.organization_id);
    if (!organization) {
      throw new HttpError(500, "Could not load organization", false);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const user = await UserModel.create({
        email: input.email,
        passwordHash,
        name: input.name,
        org: organization.name,
        organizationId: actor.organization_id,
        role,
      });

      if (!user || !isUserRole(user.role)) {
        throw new HttpError(500, "Could not create user", false);
      }

      return { user: toPublicUser(user) };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw error;
    }
  },
};
