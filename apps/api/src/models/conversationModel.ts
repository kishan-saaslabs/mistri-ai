import { query, queryOne } from "../config/database.js";

export type ChatScopeType = "call" | "deal";

export type ConversationRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  scope_type: ChatScopeType;
  scope_call_id: string | null;
  scope_deal_id: string | null;
  title: string | null;
  carried_evidence: { chunkId: string; transcriptionId: string; segmentIds: string[] }[];
  turn_count: number;
  created_at: Date;
  last_activity_at: Date;
};

export const ConversationModel = {
  findById(id: string) {
    return queryOne<ConversationRecord>("SELECT * FROM conversations WHERE id = $1", [id]);
  },

  listForUser(input: {
    userId: string;
    organizationId: string;
    scopeCallId?: string;
    scopeDealId?: string;
  }) {
    const params: unknown[] = [input.userId, input.organizationId];
    const filters = ["user_id = $1", "organization_id = $2"];
    if (input.scopeCallId) {
      params.push(input.scopeCallId);
      filters.push(`scope_call_id = $${params.length}`);
    }
    if (input.scopeDealId) {
      params.push(input.scopeDealId);
      filters.push(`scope_deal_id = $${params.length}`);
    }
    return query<ConversationRecord>(
      `SELECT * FROM conversations
       WHERE ${filters.join(" AND ")}
       ORDER BY last_activity_at DESC
       LIMIT 100`,
      params,
    );
  },

  create(input: {
    organizationId: string;
    userId: string;
    scopeType: ChatScopeType;
    scopeCallId: string | null;
    scopeDealId: string | null;
  }) {
    return queryOne<ConversationRecord>(
      `INSERT INTO conversations (organization_id, user_id, scope_type, scope_call_id, scope_deal_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.organizationId, input.userId, input.scopeType, input.scopeCallId, input.scopeDealId],
    );
  },

  updateAfterTurn(
    id: string,
    carriedEvidence: { chunkId: string; transcriptionId: string; segmentIds: string[] }[],
  ) {
    return queryOne<ConversationRecord>(
      `UPDATE conversations
       SET carried_evidence = $2::jsonb, turn_count = turn_count + 1, last_activity_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(carriedEvidence)],
    );
  },

  searchForUser(input: {
    userId: string;
    organizationId: string;
    q: string;
    scopeCallId?: string;
    scopeDealId?: string;
  }) {
    const params: unknown[] = [input.userId, input.organizationId, likePattern(input.q)];
    const filters = ["user_id = $1", "organization_id = $2", String.raw`title ILIKE $3 ESCAPE '\'`];
    if (input.scopeCallId) {
      params.push(input.scopeCallId);
      filters.push(`scope_call_id = $${params.length}`);
    }
    if (input.scopeDealId) {
      params.push(input.scopeDealId);
      filters.push(`scope_deal_id = $${params.length}`);
    }
    return query<ConversationRecord>(
      `SELECT * FROM conversations
       WHERE ${filters.join(" AND ")}
       ORDER BY last_activity_at DESC
       LIMIT 100`,
      params,
    );
  },

  deleteForUser(input: { id: string; userId: string; organizationId: string }) {
    return queryOne<{ id: string }>(
      `DELETE FROM conversations
       WHERE id = $1 AND user_id = $2 AND organization_id = $3
       RETURNING id`,
      [input.id, input.userId, input.organizationId],
    );
  },
};

function likePattern(raw: string): string {
  const escaped = raw.replace(/[%_\\]/g, (ch) => "\\" + ch);
  return "%" + escaped + "%";
}
