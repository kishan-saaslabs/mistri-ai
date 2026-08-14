import type { BoundarySignal } from "@mistri-ai/ai";
import { query, queryOne } from "../config/database.js";

export type TopicSegmentRecord = {
  id: string;
  call_id: string;
  transcription_id: string;
  seq: number;
  label: string;
  summary: string;
  segment_ids: string[];
  token_count: number;
  boundary_signals: BoundarySignal[];
  attribution_uncertain: boolean;
  created_at: Date;
};

export const TopicSegmentModel = {
  listByTranscriptionId(transcriptionId: string) {
    return query<TopicSegmentRecord>(
      "SELECT * FROM topic_segments WHERE transcription_id = $1 ORDER BY seq ASC",
      [transcriptionId],
    );
  },

  findById(id: string) {
    return queryOne<TopicSegmentRecord>("SELECT * FROM topic_segments WHERE id = $1", [id]);
  },

  findByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return query<TopicSegmentRecord>("SELECT * FROM topic_segments WHERE id = ANY($1::uuid[])", [ids]);
  },

  // Replaces every topic segment for a transcription in one transaction-
  // free pass (delete + bulk insert) — re-ingestion (a retranscription, or
  // a future chunker-version bump) is a full replace, not a merge, since
  // topic boundaries are recomputed from scratch each time.
  async replaceForTranscription(
    callId: string,
    transcriptionId: string,
    segments: {
      seq: number;
      label: string;
      summary: string;
      segmentIds: string[];
      tokenCount: number;
      boundarySignals: BoundarySignal[];
      attributionUncertain: boolean;
    }[],
  ) {
    await query("DELETE FROM topic_segments WHERE transcription_id = $1", [transcriptionId]);

    const inserted: TopicSegmentRecord[] = [];
    for (const s of segments) {
      const row = await queryOne<TopicSegmentRecord>(
        `INSERT INTO topic_segments
           (call_id, transcription_id, seq, label, summary, segment_ids, token_count, boundary_signals, attribution_uncertain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          callId,
          transcriptionId,
          s.seq,
          s.label,
          s.summary,
          s.segmentIds,
          s.tokenCount,
          s.boundarySignals,
          s.attributionUncertain,
        ],
      );
      if (row) inserted.push(row);
    }
    return inserted;
  },
};
