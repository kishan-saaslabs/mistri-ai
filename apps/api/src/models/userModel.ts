import { query, queryOne } from "../config/database.js";

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  org: string | null;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  org: string | null;
  createdAt: Date;
};

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    org: row.org,
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

  create(input: { email: string; passwordHash: string; name: string; org?: string }) {
    return queryOne<UserRecord>(
      `INSERT INTO users (email, password_hash, name, org)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.email.toLowerCase(), input.passwordHash, input.name, input.org ?? null],
    );
  },
};
