import { query, queryOne } from "../config/database.js";
import type { TranscriptSegment } from "../types/transcript.js";

export type TranscriptionRecord = {
  id: string;
  call_id: string;
  provider: string;
  model: string;
  status: string;
  language: string | null;
  duration_seconds: number | null;
  full_text: string | null;
  segments: TranscriptSegment[];
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export const TranscriptionModel = {
  listByCallId(callId: string) {
    return query<TranscriptionRecord>(
      "SELECT * FROM transcriptions WHERE call_id = $1 ORDER BY created_at DESC",
      [callId],
    );
  },

  findById(id: string) {
    return queryOne<TranscriptionRecord>("SELECT * FROM transcriptions WHERE id = $1", [id]);
  },

  create(input: { callId: string; provider?: string; model?: string }) {
    return queryOne<TranscriptionRecord>(
      `INSERT INTO transcriptions (call_id, provider, model, status, segments)
       VALUES ($1, $2, $3, 'processing', '[]'::jsonb)
       RETURNING *`,
      [input.callId, input.provider ?? "pyai", input.model ?? "pyai-hear"],
    );
  },

  markReady(id: string, input: {
    language?: string | null;
    durationSeconds?: number | null;
    fullText: string;
    segments: TranscriptSegment[];
  }) {
    return queryOne<TranscriptionRecord>(
      `UPDATE transcriptions
       SET status = 'ready',
           language = $2,
           duration_seconds = $3,
           full_text = $4,
           segments = $5::jsonb,
           error = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.language ?? null,
        input.durationSeconds ?? null,
        input.fullText,
        JSON.stringify(input.segments),
      ],
    );
  },

  markFailed(id: string, message: string) {
    return queryOne<TranscriptionRecord>(
      `UPDATE transcriptions
       SET status = 'failed', error = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, message.slice(0, 1000)],
    );
  },
};
