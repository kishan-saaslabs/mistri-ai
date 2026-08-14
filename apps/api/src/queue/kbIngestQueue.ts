import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { redisConnection } from "./redisConnection.js";

export const KB_INGEST_QUEUE = env.QUEUE_KB_INGEST_NAME;

export type KbIngestJobData = {
  callId: string;
  transcriptionId: string;
};

export const kbIngestQueue = new Queue<KbIngestJobData>(KB_INGEST_QUEUE, {
  connection: redisConnection,
});

/**
 * Publishes a job to chunk, embed, and topic-segment a transcription's
 * named transcript. Independent of call-insights generation — both are
 * published from the same hook (a fresh speaker-naming success) and
 * neither blocks the other, matching the source spec's "extraction
 * doesn't block search" principle: a slow/failing insights run must never
 * hold up chunk search coming online, and vice versa.
 */
export function publishKbIngestJob(data: KbIngestJobData) {
  return kbIngestQueue.add(KB_INGEST_QUEUE, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  });
}
