import { query, queryOne } from "../config/database.js";

export type ChunkTier = "turn_window" | "topic_summary";

export type ChunkRecord = {
  id: string;
  call_id: string;
  transcription_id: string;
  topic_segment_id: string | null;
  tier: ChunkTier;
  seq: number;
  body: string;
  body_hash: string;
  segment_ids: string[];
  anchor_segment_id: string | null;
  token_count: number;
  attribution_uncertain: boolean;
  created_at: Date;
};

export const ChunkModel = {
  listByTranscriptionId(transcriptionId: string, tier?: ChunkTier) {
    if (tier) {
      return query<ChunkRecord>(
        "SELECT * FROM chunks WHERE transcription_id = $1 AND tier = $2 ORDER BY seq ASC",
        [transcriptionId, tier],
      );
    }
    return query<ChunkRecord>("SELECT * FROM chunks WHERE transcription_id = $1 ORDER BY tier, seq ASC", [
      transcriptionId,
    ]);
  },

  findByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return query<ChunkRecord>("SELECT * FROM chunks WHERE id = ANY($1::uuid[])", [ids]);
  },

  async replaceForTranscription(
    callId: string,
    transcriptionId: string,
    chunks: {
      topicSegmentId: string | null;
      tier: ChunkTier;
      seq: number;
      body: string;
      bodyHash: string;
      segmentIds: string[];
      anchorSegmentId: string | null;
      tokenCount: number;
      attributionUncertain: boolean;
    }[],
  ) {
    await query("DELETE FROM chunks WHERE transcription_id = $1", [transcriptionId]);

    const inserted: ChunkRecord[] = [];
    for (const c of chunks) {
      const row = await queryOne<ChunkRecord>(
        `INSERT INTO chunks
           (call_id, transcription_id, topic_segment_id, tier, seq, body, body_hash, segment_ids, anchor_segment_id, token_count, attribution_uncertain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          callId,
          transcriptionId,
          c.topicSegmentId,
          c.tier,
          c.seq,
          c.body,
          c.bodyHash,
          c.segmentIds,
          c.anchorSegmentId,
          c.tokenCount,
          c.attributionUncertain,
        ],
      );
      if (row) inserted.push(row);
    }
    return inserted;
  },

  /**
   * Hybrid retrieval — one SQL query, vector cosine + lexical rank fused
   * with RRF (k=60, vector weight 1.0, lexical 0.7), scoped to an already-
   * ACL-resolved transcription-id list and the turn_window tier only
   * (topic_summary chunks are read directly for whole-call/topic context,
   * never returned as search hits). Exact scan, no ANN index — see the
   * plan: call/deal scope never has enough vectors to need one.
   */
  async hybridSearch(transcriptionIds: string[], queryEmbedding: number[], queryText: string, limit: number) {
    if (transcriptionIds.length === 0) return [];
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    return query<ChunkRecord & { rrf: number }>(
      `WITH scoped AS (
         SELECT c.*, ce.embedding
         FROM chunks c
         JOIN chunk_embeddings ce ON ce.chunk_id = c.id
         WHERE c.transcription_id = ANY($1::uuid[]) AND c.tier = 'turn_window'
       ),
       vec AS (
         SELECT id, row_number() OVER (ORDER BY embedding <=> $2::vector) AS rank
         FROM scoped ORDER BY embedding <=> $2::vector LIMIT 40
       ),
       lex AS (
         SELECT id, row_number() OVER (ORDER BY ts_rank_cd(body_tsv, plainto_tsquery('english', $3)) DESC) AS rank
         FROM scoped WHERE body_tsv @@ plainto_tsquery('english', $3) LIMIT 40
       )
       SELECT s.id, s.call_id, s.transcription_id, s.topic_segment_id, s.tier, s.seq, s.body, s.body_hash,
              s.segment_ids, s.anchor_segment_id, s.token_count, s.attribution_uncertain, s.created_at,
              -- Cast to double precision: node-pg returns NUMERIC (what
              -- "1.0 / bigint" produces) as a string, not a number, to
              -- avoid silent precision loss. float8 is auto-parsed to a
              -- real JS number, which is what every caller expects rrf to be.
              (COALESCE(1.0 / (60 + vec.rank), 0) + COALESCE(0.7 / (60 + lex.rank), 0))::double precision AS rrf
       FROM scoped s
       FULL OUTER JOIN vec ON vec.id = s.id
       FULL OUTER JOIN lex ON lex.id = s.id
       WHERE vec.id IS NOT NULL OR lex.id IS NOT NULL
       ORDER BY rrf DESC
       LIMIT $4`,
      [transcriptionIds, vectorLiteral, queryText, limit],
    );
  },
};
