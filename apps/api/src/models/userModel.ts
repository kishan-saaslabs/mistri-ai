import type pg from "pg";
import { query, queryOne } from "../config/database.js";

export const USER_ROLES = ["OWNER", "ADMIN", "TEAM_MEMBER"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = "OWNER";

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function canSeeAllDeals(role: UserRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageOrgUsers(role: UserRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "OWNER") {
    return true;
  }
  if (actorRole === "ADMIN") {
    return targetRole !== "OWNER";
  }
  return false;
}

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  org: string | null;
  organization_id: string;
  role: UserRole;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  org: string | null;
  organizationId: string;
  role: UserRole;
  createdAt: Date;
};

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    org: row.org,
    organizationId: row.organization_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

export const UserModel = {
  findByEmail(email: string) {
    return queryOne<UserRecord>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  },

  findById(id: string) {
    return queryOne<UserRecord>("SELECT * FROM users WHERE id = $1", [id]);
  },

  findByIds(ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve([] as UserRecord[]);
    }
    return query<UserRecord>("SELECT * FROM users WHERE id = ANY($1::uuid[])", [ids]);
  },

  create(
    input: {
      email: string;
      passwordHash: string;
      name: string;
      org?: string;
      organizationId: string;
      role?: UserRole;
    },
    client?: pg.PoolClient,
  ) {
    return queryOne<UserRecord>(
      `INSERT INTO users (email, password_hash, name, org, organization_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.email.toLowerCase(),
        input.passwordHash,
        input.name,
        input.org ?? null,
        input.organizationId,
        input.role ?? DEFAULT_USER_ROLE,
      ],
      client,
    );
  },
};
