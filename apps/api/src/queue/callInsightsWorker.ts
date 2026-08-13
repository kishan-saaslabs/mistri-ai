import { Worker, type Job } from "bullmq";
import { CallInsightService } from "../services/callInsightService.js";
import { CALL_INSIGHTS_QUEUE, type CallInsightsJobData } from "./callInsightsQueue.js";
import { redisConnection } from "./redisConnection.js";

async function processCallInsightsJob(job: Job<CallInsightsJobData>) {
  return CallInsightService.generateForTranscription(job.data.transcriptionId);
}

export function startCallInsightsWorker() {
  const worker = new Worker<CallInsightsJobData>(CALL_INSIGHTS_QUEUE, processCallInsightsJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on("failed", (job, error) => {
    console.error(`call-insights job ${job?.id ?? "unknown"} failed:`, error.message);
  });

  return worker;
}
