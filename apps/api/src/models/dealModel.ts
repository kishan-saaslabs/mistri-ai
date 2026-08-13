import { pool, query, queryOne } from "../config/database.js";

export type DealRecord = {
  id: string;
  organization_id: string;
  name: string;
  created_by: string | null;
  created_at: Date;
};

export const DealModel = {
  listForOrg(organizationId: string) {
    return query<DealRecord>(
      "SELECT * FROM deals WHERE organization_id = $1 ORDER BY created_at DESC",
      [organizationId],
    );
  },

  listForUser(userId: string, organizationId: string) {
    return query<DealRecord>(
      `SELECT d.*
       FROM deals d
       INNER JOIN user_deals ud ON ud.deal_id = d.id
       WHERE ud.user_id = $1 AND d.organization_id = $2
       ORDER BY d.created_at DESC`,
      [userId, organizationId],
    );
  },

  findById(id: string) {
    return queryOne<DealRecord>("SELECT * FROM deals WHERE id = $1", [id]);
  },

  async create(input: { name: string; createdBy: string; organizationId: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const dealResult = await client.query<DealRecord>(
        `INSERT INTO deals (name, created_by, organization_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.name, input.createdBy, input.organizationId],
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
