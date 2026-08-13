import { pool, query, queryOne } from "../config/database.js";

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

  listForUser(userId: string) {
    return query<DealRecord>(
      `SELECT d.*
       FROM deals d
       INNER JOIN user_deals ud ON ud.deal_id = d.id
       WHERE ud.user_id = $1
       ORDER BY d.created_at DESC`,
      [userId],
    );
  },

  findById(id: string) {
    return queryOne<DealRecord>("SELECT * FROM deals WHERE id = $1", [id]);
  },

  async create(input: { name: string; createdBy: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const dealResult = await client.query<DealRecord>(
        `INSERT INTO deals (name, created_by)
         VALUES ($1, $2)
         RETURNING *`,
        [input.name, input.createdBy],
      );
      const deal = dealResult.rows[0];
      if (!deal) {
        throw new Error("Could not create deal");
      }
      await client.query(
        `INSERT INTO user_deals (user_id, deal_id)
         VALUES ($1, $2)`,
        [input.createdBy, deal.id],
      );
      await client.query("COMMIT");
      return deal;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};
