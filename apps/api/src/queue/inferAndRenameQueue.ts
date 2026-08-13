import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { redisConnection } from "./redisConnection.js";

export const INFER_AND_RENAME_QUEUE = env.QUEUE_INFER_AND_RENAME_NAME;

export type InferAndRenameJobData = {
  callId: string;
  transcriptionId: string;
};

export const inferAndRenameQueue = new Queue<InferAndRenameJobData>(INFER_AND_RENAME_QUEUE, {
  connection: redisConnection,
});

/**
 * Publishes a job to run LLM speaker-name inference for one transcription.
 * This module only knows how to enqueue — callers decide when (e.g. right
 * after a transcription becomes ready, or on-demand from an API route).
 */
export function publishInferAndRenameJob(data: InferAndRenameJobData) {
  return inferAndRenameQueue.add(INFER_AND_RENAME_QUEUE, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  });
}
