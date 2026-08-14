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
};
