import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env, isProduction } from "./config/env.js";
import { mountDocs } from "./docs/swagger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { mountBullBoard } from "./queue/bullBoard.js";
import { CallController } from "./controllers/callController.js";
import { apiRouter } from "./routes/apiRoutes.js";
import { authRouter } from "./routes/authRoutes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(
    morgan(isProduction ? "combined" : "dev", {
      skip: (req) => req.path.includes("provider-audio"),
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  mountDocs(app);
  mountBullBoard(app);

  app.get("/api/calls/:id/provider-audio", CallController.providerAudio);
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
