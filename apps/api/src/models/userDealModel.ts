import { query, queryOne } from "../config/database.js";
import type { UserRole } from "./userModel.js";

export type UserDealRecord = {
  id: string;
  user_id: string;
  deal_id: string;
  created_at: Date;
};

export type DealMemberRow = {
  id: string;
  email: string;
  name: string;
  org: string | null;
  organization_id: string;
  role: UserRole;
  created_at: Date;
};

export const UserDealModel = {
  add(userId: string, dealId: string) {
    return queryOne<UserDealRecord>(
      `INSERT INTO user_deals (user_id, deal_id)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, dealId],
    );
  },

  addMany(userIds: string[], dealId: string) {
    if (userIds.length === 0) {
      return Promise.resolve([] as UserDealRecord[]);
    }
    return query<UserDealRecord>(
      `INSERT INTO user_deals (user_id, deal_id)
       SELECT uid, $2::uuid
       FROM unnest($1::uuid[]) AS uid
       ON CONFLICT (user_id, deal_id) DO NOTHING
       RETURNING *`,
      [userIds, dealId],
    );
  },

  find(userId: string, dealId: string) {
    return queryOne<UserDealRecord>(
      "SELECT * FROM user_deals WHERE user_id = $1 AND deal_id = $2",
      [userId, dealId],
    );
  },

  listMembers(dealId: string) {
    return query<DealMemberRow>(
      `SELECT u.id, u.email, u.name, u.org, u.organization_id, u.role, u.created_at
       FROM user_deals ud
       INNER JOIN users u ON u.id = ud.user_id
       WHERE ud.deal_id = $1
       ORDER BY ud.created_at ASC`,
      [dealId],
    );
  },
};
