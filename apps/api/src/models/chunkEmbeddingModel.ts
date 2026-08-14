import { query, queryOne } from "../config/database.js";

export type ChunkEmbeddingRecord = {
  chunk_id: string;
  model: string;
  embedding: number[];
  created_at: Date;
};

// pgvector's Postgres text format is just "[v1,v2,v3]" — the `pgvector` npm
// helper package requires Node >=22 (this repo's local dev Node is 20), so
// this hand-rolls the same trivial serialization rather than pulling in a
// dependency for a one-line format.
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function parseVectorLiteral(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  const text = String(raw);
  return text
    .slice(1, -1)
    .split(",")
    .filter((v) => v.length > 0)
    .map(Number);
}

export const ChunkEmbeddingModel = {
  async upsertMany(rows: { chunkId: string; model: string; embedding: number[] }[]) {
    for (const row of rows) {
      await query(
        `INSERT INTO chunk_embeddings (chunk_id, model, embedding)
         VALUES ($1, $2, $3::vector)
         ON CONFLICT (chunk_id) DO UPDATE SET model = EXCLUDED.model, embedding = EXCLUDED.embedding`,
        [row.chunkId, row.model, toVectorLiteral(row.embedding)],
      );
    }
  },

  async findByChunkIds(chunkIds: string[]): Promise<ChunkEmbeddingRecord[]> {
    if (chunkIds.length === 0) return [];
    const rows = await query<{ chunk_id: string; model: string; embedding: unknown; created_at: Date }>(
      "SELECT chunk_id, model, embedding::text AS embedding, created_at FROM chunk_embeddings WHERE chunk_id = ANY($1::uuid[])",
      [chunkIds],
    );
    return rows.map((r) => ({ ...r, embedding: parseVectorLiteral(r.embedding) }));
  },

  /**
   * Exact-scan cosine search (no ANN index — see the plan: call/deal scope
   * never has enough vectors to need one). Scoped to a transcription-id
   * list resolved upstream by retrievalService's one scope-resolution
   * function; this model never resolves access itself.
   */
  async nearestByCosine(transcriptionIds: string[], queryEmbedding: number[], limit: number) {
    if (transcriptionIds.length === 0) return [];
    return query<{ chunk_id: string; distance: number }>(
      `SELECT ce.chunk_id, ce.embedding <=> $2::vector AS distance
       FROM chunk_embeddings ce
       JOIN chunks c ON c.id = ce.chunk_id
       WHERE c.transcription_id = ANY($1::uuid[])
       ORDER BY ce.embedding <=> $2::vector
       LIMIT $3`,
      [transcriptionIds, toVectorLiteral(queryEmbedding), limit],
    );
  },

  findById: (chunkId: string) =>
    queryOne<{ chunk_id: string; model: string; embedding: unknown }>(
      "SELECT chunk_id, model, embedding::text AS embedding FROM chunk_embeddings WHERE chunk_id = $1",
      [chunkId],
    ),
};
