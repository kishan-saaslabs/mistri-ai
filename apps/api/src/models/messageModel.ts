import type { ChatCitation } from "@mistri-ai/ai";
import { query, queryOne } from "../config/database.js";

export type MessageRecord = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  original_query: string | null;
  rewritten_query: string | null;
  citations: ChatCitation[];
  context_stats: Record<string, unknown> | null;
  created_at: Date;
};

export const MessageModel = {
  listByConversationId(conversationId: string) {
    return query<MessageRecord>(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId],
    );
  },

  insertUserMessage(input: { conversationId: string; content: string; originalQuery: string; rewrittenQuery: string | null }) {
    return queryOne<MessageRecord>(
      `INSERT INTO messages (conversation_id, role, content, original_query, rewritten_query)
       VALUES ($1, 'user', $2, $3, $4)
       RETURNING *`,
      [input.conversationId, input.content, input.originalQuery, input.rewrittenQuery],
    );
  },

  insertAssistantMessage(input: {
    conversationId: string;
    content: string;
    citations: ChatCitation[];
    contextStats: Record<string, unknown>;
  }) {
    return queryOne<MessageRecord>(
      `INSERT INTO messages (conversation_id, role, content, citations, context_stats)
       VALUES ($1, 'assistant', $2, $3::jsonb, $4::jsonb)
       RETURNING *`,
      [input.conversationId, input.content, JSON.stringify(input.citations), JSON.stringify(input.contextStats)],
    );
  },
};
