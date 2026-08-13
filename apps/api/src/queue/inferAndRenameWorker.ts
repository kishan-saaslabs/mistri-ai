import { Worker, type Job } from "bullmq";
import { CallModel } from "../models/callModel.js";
import { TranscriptionModel } from "../models/transcriptionModel.js";
import { TranscriptionService } from "../services/transcriptionService.js";
import { INFER_AND_RENAME_QUEUE, type InferAndRenameJobData } from "./inferAndRenameQueue.js";
import { redisConnection } from "./redisConnection.js";

async function processInferAndRenameJob(job: Job<InferAndRenameJobData>) {
  const { callId, transcriptionId } = job.data;
  try {
    const transcription = await TranscriptionModel.findById(transcriptionId);
    if (!transcription) {
      throw new Error(`Transcription ${transcriptionId} not found`);
    }

    await TranscriptionService.inferAndRenameSpeakers(transcription);
    await CallModel.updateStatus(callId, "LLM_SUCCESS");
  } catch (error) {
    await CallModel.updateStatus(callId, "LLM_FAILED");
    throw error;
  }
}

export function startInferAndRenameWorker() {
  const worker = new Worker<InferAndRenameJobData>(INFER_AND_RENAME_QUEUE, processInferAndRenameJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on("failed", (job, error) => {
    console.error(`infer-and-rename job ${job?.id ?? "unknown"} failed:`, error.message);
  });

  return worker;
}
