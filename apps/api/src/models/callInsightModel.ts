import type {
  CallInsightCustomerWant,
  CallInsightFollowUpEmail,
  CallInsightNextStep,
  CallInsightObjection,
  CallInsightSummaryItem,
} from "@mistri-ai/ai";
import { queryOne } from "../config/database.js";

export const CALL_INSIGHT_STATUSES = ["PROCESSING", "SUCCESS", "FAILED"] as const;
export type CallInsightStatus = (typeof CALL_INSIGHT_STATUSES)[number];

export type CallInsightRecord = {
  id: string;
  call_id: string;
  transcription_id: string;
  status: CallInsightStatus;
  summary: CallInsightSummaryItem[];
  objections: CallInsightObjection[];
  customer_wants: CallInsightCustomerWant[];
  next_steps: CallInsightNextStep[];
  follow_up_email: CallInsightFollowUpEmail | null;
  error: string | null;
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

  // Upsert on transcription_id: creates the row the moment generation
  // starts (status PROCESSING, empty placeholders) so it's observable
  // immediately rather than only appearing once fully done. Also the
  // re-entry point for a transcription whose previous attempt FAILED (or
  // got stuck PROCESSING, e.g. a crash) — resets it back to PROCESSING and
  // clears any prior error rather than leaving stale failure data visible
  // mid-retry.
  markProcessing(input: { callId: string; transcriptionId: string }) {
    return queryOne<CallInsightRecord>(
      `INSERT INTO call_insights (call_id, transcription_id, status)
       VALUES ($1, $2, 'PROCESSING')
       ON CONFLICT (transcription_id) DO UPDATE
         SET status = 'PROCESSING', error = NULL, updated_at = NOW()
       RETURNING *`,
      [input.callId, input.transcriptionId],
    );
  },

  markSuccess(input: {
    transcriptionId: string;
    summary: CallInsightSummaryItem[];
    objections: CallInsightObjection[];
    customerWants: CallInsightCustomerWant[];
    nextSteps: CallInsightNextStep[];
    followUpEmail: CallInsightFollowUpEmail | null;
  }) {
    return queryOne<CallInsightRecord>(
      `UPDATE call_insights
       SET status = 'SUCCESS',
           summary = $2::jsonb,
           objections = $3::jsonb,
           customer_wants = $4::jsonb,
           next_steps = $5::jsonb,
           follow_up_email = $6::jsonb,
           error = NULL,
           updated_at = NOW()
       WHERE transcription_id = $1
       RETURNING *`,
      [
        input.transcriptionId,
        JSON.stringify(input.summary),
        JSON.stringify(input.objections),
        JSON.stringify(input.customerWants),
        JSON.stringify(input.nextSteps),
        input.followUpEmail ? JSON.stringify(input.followUpEmail) : null,
      ],
    );
  },

  markFailed(transcriptionId: string, message: string) {
    return queryOne<CallInsightRecord>(
      `UPDATE call_insights
       SET status = 'FAILED', error = $2, updated_at = NOW()
       WHERE transcription_id = $1
       RETURNING *`,
      [transcriptionId, message.slice(0, 1000)],
    );
  },
};
