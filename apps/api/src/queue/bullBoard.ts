import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Express } from "express";
import helmet from "helmet";
import { callInsightsQueue } from "./callInsightsQueue.js";
import { inferAndRenameQueue } from "./inferAndRenameQueue.js";
import { kbIngestQueue } from "./kbIngestQueue.js";

/**
 * Read-only-ish debug UI for BullMQ queues, mounted the same way Swagger
 * is (see docs/swagger.ts) — no auth today, matching /docs. Note this
 * lets a caller retry/remove/pause jobs, not just view them, so it should
 * gain real auth (or be dropped entirely) before this app is ever exposed
 * outside local dev.
 */
export function mountBullBoard(app: Express) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(inferAndRenameQueue),
      new BullMQAdapter(callInsightsQueue),
      new BullMQAdapter(kbIngestQueue),
    ],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
    serverAdapter.getRouter(),
  );
}
