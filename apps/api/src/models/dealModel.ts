import { query, queryOne } from "../config/database.js";

export type DealRecord = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: Date;
};

export const DealModel = {
  list() {
    return query<DealRecord>("SELECT * FROM deals ORDER BY created_at DESC");
  },

  findById(id: string) {
    return queryOne<DealRecord>("SELECT * FROM deals WHERE id = $1", [id]);
  },

  create(input: { name: string; createdBy?: string }) {
    return queryOne<DealRecord>(
      `INSERT INTO deals (name, created_by)
       VALUES ($1, $2)
       RETURNING *`,
      [input.name, input.createdBy ?? null],
    );
  },
};
