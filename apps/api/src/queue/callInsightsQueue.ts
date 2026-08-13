import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { redisConnection } from "./redisConnection.js";

export const CALL_INSIGHTS_QUEUE = env.QUEUE_CALL_INSIGHTS_NAME;

export type CallInsightsJobData = {
  callId: string;
  transcriptionId: string;
};

export const callInsightsQueue = new Queue<CallInsightsJobData>(CALL_INSIGHTS_QUEUE, {
  connection: redisConnection,
});

/**
 * Publishes a job to generate call insights (summary, objections, what
 * the customer wants, next steps, optional follow-up email) from a
 * transcription's NAMED transcript. Only meaningful once speaker-name
 * inference has produced a call_transcripts row for this transcriptionId
 * — this module only knows how to enqueue, not when it's safe to call.
 */
export function publishCallInsightsJob(data: CallInsightsJobData) {
  return callInsightsQueue.add(CALL_INSIGHTS_QUEUE, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  });
}
