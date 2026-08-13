import { query, queryOne } from "../config/database.js";

export type CallAnalysis = {
  intent: Array<{ plan: string; pct: number }>;
  segments: Array<{ id: string; t: string; who: string; speaker: string; text: string }>;
  signals: Array<{ title: string; desc: string; segId: string }>;
  risks: Array<{ title: string; desc: string; segId: string }>;
  nextSteps: Array<{ text: string; owner: string; done: boolean }>;
};

export type CallRecord = {
  id: string;
  deal_id: string | null;
  rep_id: string;
  label: string;
  filename: string | null;
  duration_seconds: number;
  score: number | null;
  verdict: string | null;
  status_color: string;
  status: string;
  storage_path: string | null;
  source_url: string | null;
  analysis: CallAnalysis;
  created_at: Date;
};

export type CallInsert = {
  dealId?: string | null;
  repId: string;
  label: string;
  filename?: string | null;
  durationSeconds?: number;
  score?: number | null;
  verdict?: string | null;
  statusColor?: string;
  status?: string;
  storagePath?: string | null;
  sourceUrl?: string | null;
  analysis?: CallAnalysis;
};

export const CallModel = {
  list() {
    return query<CallRecord>("SELECT * FROM calls ORDER BY created_at DESC");
  },

  findById(id: string) {
    return queryOne<CallRecord>("SELECT * FROM calls WHERE id = $1", [id]);
  },

  create(input: CallInsert) {
    return queryOne<CallRecord>(
      `INSERT INTO calls (
         deal_id, rep_id, label, filename, duration_seconds, score, verdict,
         status_color, status, storage_path, source_url, analysis
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       RETURNING *`,
      [
        input.dealId ?? null,
        input.repId,
        input.label,
        input.filename ?? null,
        input.durationSeconds ?? 0,
        input.score ?? null,
        input.verdict ?? null,
        input.statusColor ?? "neutral",
        input.status ?? "ready",
        input.storagePath ?? null,
        input.sourceUrl ?? null,
        JSON.stringify(input.analysis ?? emptyAnalysis()),
      ],
    );
  },

  updateDeal(id: string, dealId: string | null) {
    return queryOne<CallRecord>(
      `UPDATE calls SET deal_id = $2 WHERE id = $1 RETURNING *`,
      [id, dealId],
    );
  },
};

export function emptyAnalysis(): CallAnalysis {
  return { intent: [], segments: [], signals: [], risks: [], nextSteps: [] };
}
