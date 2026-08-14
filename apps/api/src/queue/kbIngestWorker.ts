import { Worker, type Job } from "bullmq";
import { KbIngestService } from "../services/kbIngestService.js";
import { KB_INGEST_QUEUE, type KbIngestJobData } from "./kbIngestQueue.js";
import { redisConnection } from "./redisConnection.js";

async function processKbIngestJob(job: Job<KbIngestJobData>) {
  return KbIngestService.ingestForTranscription(job.data.transcriptionId);
}

export function startKbIngestWorker() {
  const worker = new Worker<KbIngestJobData>(KB_INGEST_QUEUE, processKbIngestJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on("failed", (job, error) => {
    console.error(`kb-ingest job ${job?.id ?? "unknown"} failed:`, error.message);
  });

  return worker;
}
