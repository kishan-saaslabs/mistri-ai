import type {
  CallInsightCustomerWant,
  CallInsightFollowUpEmail,
  CallInsightNextStep,
  CallInsightObjection,
  CallInsightSummaryItem,
} from "@mistri-ai/ai";
import { queryOne } from "../config/database.js";

export type CallInsightRecord = {
  id: string;
  call_id: string;
  transcription_id: string;
  summary: CallInsightSummaryItem[];
  objections: CallInsightObjection[];
  customer_wants: CallInsightCustomerWant[];
  next_steps: CallInsightNextStep[];
  follow_up_email: CallInsightFollowUpEmail | null;
  created_at: Date;
  updated_at: Date;
};

export const CallInsightModel = {
  findByTranscriptionId(transcriptionId: string) {
    return queryOne<CallInsightRecord>(
      "SELECT * FROM call_insights WHERE transcription_id = $1",
      [transcriptionId],
    );
  },

  // Upsert on transcription_id, same reasoning as CallTranscriptModel: a
  // race between two concurrent jobs for the same transcription should
  // overwrite, not throw on the UNIQUE constraint.
  upsert(input: {
    callId: string;
    transcriptionId: string;
    summary: CallInsightSummaryItem[];
    objections: CallInsightObjection[];
    customerWants: CallInsightCustomerWant[];
    nextSteps: CallInsightNextStep[];
    followUpEmail: CallInsightFollowUpEmail | null;
  }) {
    return queryOne<CallInsightRecord>(
      `INSERT INTO call_insights (
         call_id, transcription_id, summary, objections, customer_wants, next_steps, follow_up_email
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (transcription_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             objections = EXCLUDED.objections,
             customer_wants = EXCLUDED.customer_wants,
             next_steps = EXCLUDED.next_steps,
             follow_up_email = EXCLUDED.follow_up_email,
             updated_at = NOW()
       RETURNING *`,
      [
        input.callId,
        input.transcriptionId,
        JSON.stringify(input.summary),
        JSON.stringify(input.objections),
        JSON.stringify(input.customerWants),
        JSON.stringify(input.nextSteps),
        input.followUpEmail ? JSON.stringify(input.followUpEmail) : null,
      ],
    );
  },
};
