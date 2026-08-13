import { queryOne } from "../config/database.js";

export const USER_ROLES = ["OWNER", "ADMIN", "TEAM_MEMBER"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = "OWNER";

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function canSeeAllDeals(role: UserRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  org: string | null;
  role: UserRole;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  org: string | null;
  role: UserRole;
  createdAt: Date;
};

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    org: row.org,
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

  create(input: {
    email: string;
    passwordHash: string;
    name: string;
    org?: string;
    role?: UserRole;
  }) {
    return queryOne<UserRecord>(
      `INSERT INTO users (email, password_hash, name, org, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.email.toLowerCase(),
        input.passwordHash,
        input.name,
        input.org ?? null,
        input.role ?? DEFAULT_USER_ROLE,
      ],
    );
  },
};
