import { query, queryOne } from "../config/database.js";

export const CALL_STATUSES = ["queued", "PROCESSING", "PYAI_SUCCESS", "PYAI_FAILED"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export type CallRecord = {
  id: string;
  organization_id: string;
  deal_id: string | null;
  uploaded_by: string | null;
  label: string;
  filename: string | null;
  duration_seconds: number;
  status: CallStatus;
  storage_path: string | null;
  source_url: string | null;
  created_at: Date;
};

export type CallInsert = {
  organizationId: string;
  dealId?: string | null;
  uploadedBy?: string | null;
  label: string;
  filename?: string | null;
  durationSeconds?: number;
  status?: CallStatus;
  storagePath?: string | null;
  sourceUrl?: string | null;
};

export const CallModel = {
  listForOrg(organizationId: string) {
    return query<CallRecord>(
      "SELECT * FROM calls WHERE organization_id = $1 ORDER BY created_at DESC",
      [organizationId],
    );
  },

  listForUser(userId: string, organizationId: string) {
    return query<CallRecord>(
      `SELECT c.*
       FROM calls c
       WHERE c.organization_id = $2 AND (
         (
           c.deal_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM user_deals ud
             WHERE ud.deal_id = c.deal_id AND ud.user_id = $1
           )
         ) OR (
           c.deal_id IS NULL AND c.uploaded_by = $1
         )
       )
       ORDER BY c.created_at DESC`,
      [userId, organizationId],
    );
  },

  listByDeal(dealId: string, organizationId: string) {
    return query<CallRecord>(
      "SELECT * FROM calls WHERE deal_id = $1 AND organization_id = $2 ORDER BY created_at DESC",
      [dealId, organizationId],
    );
  },

  findById(id: string) {
    return queryOne<CallRecord>("SELECT * FROM calls WHERE id = $1", [id]);
  },

  create(input: CallInsert) {
    return queryOne<CallRecord>(
      `INSERT INTO calls (
         organization_id, deal_id, uploaded_by, label, filename, duration_seconds, status, storage_path, source_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        input.organizationId,
        input.dealId ?? null,
        input.uploadedBy ?? null,
        input.label,
        input.filename ?? null,
        input.durationSeconds ?? 0,
        input.status ?? "PROCESSING",
        input.storagePath ?? null,
        input.sourceUrl ?? null,
      ],
    );
  },

  updateDeal(id: string, dealId: string | null) {
    return queryOne<CallRecord>("UPDATE calls SET deal_id = $2 WHERE id = $1 RETURNING *", [id, dealId]);
  },

  updateStatus(id: string, status: CallStatus, durationSeconds?: number) {
    if (typeof durationSeconds === "number") {
      return queryOne<CallRecord>(
        "UPDATE calls SET status = $2, duration_seconds = $3 WHERE id = $1 RETURNING *",
        [id, status, durationSeconds],
      );
    }
    return queryOne<CallRecord>("UPDATE calls SET status = $2 WHERE id = $1 RETURNING *", [id, status]);
  },
};
