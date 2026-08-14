import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { createApp } from "./app.js";
import { startCallInsightsWorker } from "./queue/callInsightsWorker.js";
import { startInferAndRenameWorker } from "./queue/inferAndRenameWorker.js";
import { startKbIngestWorker } from "./queue/kbIngestWorker.js";
import { redisConnection } from "./queue/redisConnection.js";
import { ensureObjectStorage } from "./services/objectStorage.js";
import { TranscriptionService } from "./services/transcriptionService.js";

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
  console.log(`Swagger UI: http://localhost:${env.API_PORT}/docs`);
});

void ensureObjectStorage().catch((error) => {
  const name = error instanceof Error ? error.name : "Error";
  console.error("Could not initialize object storage:", name);
});

const inferAndRenameWorker = startInferAndRenameWorker();
const callInsightsWorker = startCallInsightsWorker();
const kbIngestWorker = startKbIngestWorker();

void TranscriptionService.resumeInFlightJobs().catch((error) => {
  const message = error instanceof Error ? error.message : "Resume failed";
  console.error("Could not resume in-flight transcriptions:", message);
});

async function shutdown() {
  server.close();
  await inferAndRenameWorker.close();
  await callInsightsWorker.close();
  await kbIngestWorker.close();
  redisConnection.disconnect();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
