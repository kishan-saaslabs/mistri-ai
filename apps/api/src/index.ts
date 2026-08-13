import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { createApp } from "./app.js";
import { startInferAndRenameWorker } from "./queue/inferAndRenameWorker.js";
import { redisConnection } from "./queue/redisConnection.js";

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
  console.log(`Swagger UI: http://localhost:${env.API_PORT}/docs`);
});

const inferAndRenameWorker = startInferAndRenameWorker();

async function shutdown() {
  server.close();
  await inferAndRenameWorker.close();
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
