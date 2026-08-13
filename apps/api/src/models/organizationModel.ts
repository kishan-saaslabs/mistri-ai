import type pg from "pg";
import { queryOne } from "../config/database.js";

export type OrganizationRecord = {
  id: string;
  name: string;
  created_at: Date;
};

export const OrganizationModel = {
  findById(id: string, client?: pg.PoolClient) {
    return queryOne<OrganizationRecord>("SELECT * FROM organizations WHERE id = $1", [id], client);
  },

  create(name: string, client?: pg.PoolClient) {
    return queryOne<OrganizationRecord>(
      `INSERT INTO organizations (name)
       VALUES ($1)
       RETURNING *`,
      [name],
      client,
    );
  },
};
