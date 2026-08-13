import { Worker, type Job } from "bullmq";
import { TranscriptionModel } from "../models/transcriptionModel.js";
import { TranscriptionService } from "../services/transcriptionService.js";
import { INFER_AND_RENAME_QUEUE, type InferAndRenameJobData } from "./inferAndRenameQueue.js";
import { redisConnection } from "./redisConnection.js";

async function processInferAndRenameJob(job: Job<InferAndRenameJobData>) {
  const transcription = await TranscriptionModel.findById(job.data.transcriptionId);
  if (!transcription) {
    throw new Error(`Transcription ${job.data.transcriptionId} not found`);
  }

  // Same logic the synchronous API path uses: guard on transcription.status
  // === PYAI_SUCCESS, cache check, null-speaker / empty-segments short
  // circuits, LLM call, upsert into call_transcripts. All status tracking
  // (LLM_TRANSCRIBING/LLM_SUCCESS/LLM_FAILED) happens on the transcription
  // itself inside this call, not here — see the "Guard" comment in
  // transcriptionService.ts for why it's the transcription's status, not
  // the call's. Returned so job.returnvalue (visible in Bull Board) shows
  // the actual outcome, including a `reason` when the job was a guard-skip
  // or short circuit.
  return TranscriptionService.inferAndRenameSpeakers(transcription);
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
