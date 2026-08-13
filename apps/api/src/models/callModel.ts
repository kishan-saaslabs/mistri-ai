import { query, queryOne } from "../config/database.js";

export type CallRecord = {
  id: string;
  deal_id: string | null;
  uploaded_by: string | null;
  label: string;
  filename: string | null;
  duration_seconds: number;
  status: string;
  storage_path: string | null;
  source_url: string | null;
  created_at: Date;
};

export type CallInsert = {
  dealId?: string | null;
  uploadedBy?: string | null;
  label: string;
  filename?: string | null;
  durationSeconds?: number;
  status?: string;
  storagePath?: string | null;
  sourceUrl?: string | null;
};

export const CallModel = {
  list() {
    return query<CallRecord>("SELECT * FROM calls ORDER BY created_at DESC");
  },

  listForUser(userId: string) {
    return query<CallRecord>(
      `SELECT c.*
       FROM calls c
       WHERE (
         c.deal_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM user_deals ud
           WHERE ud.deal_id = c.deal_id AND ud.user_id = $1
         )
       ) OR (
         c.deal_id IS NULL AND c.uploaded_by = $1
       )
       ORDER BY c.created_at DESC`,
      [userId],
    );
  },

  listByDeal(dealId: string) {
    return query<CallRecord>("SELECT * FROM calls WHERE deal_id = $1 ORDER BY created_at DESC", [dealId]);
  },

  findById(id: string) {
    return queryOne<CallRecord>("SELECT * FROM calls WHERE id = $1", [id]);
  },

  create(input: CallInsert) {
    return queryOne<CallRecord>(
      `INSERT INTO calls (
         deal_id, uploaded_by, label, filename, duration_seconds, status, storage_path, source_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.dealId ?? null,
        input.uploadedBy ?? null,
        input.label,
        input.filename ?? null,
        input.durationSeconds ?? 0,
        input.status ?? "processing",
        input.storagePath ?? null,
        input.sourceUrl ?? null,
      ],
    );
  },

  updateDeal(id: string, dealId: string | null) {
    return queryOne<CallRecord>("UPDATE calls SET deal_id = $2 WHERE id = $1 RETURNING *", [id, dealId]);
  },

  updateStatus(id: string, status: string, durationSeconds?: number) {
    if (typeof durationSeconds === "number") {
      return queryOne<CallRecord>(
        "UPDATE calls SET status = $2, duration_seconds = $3 WHERE id = $1 RETURNING *",
        [id, status, durationSeconds],
      );
    }
    return queryOne<CallRecord>("UPDATE calls SET status = $2 WHERE id = $1 RETURNING *", [id, status]);
  },
};
