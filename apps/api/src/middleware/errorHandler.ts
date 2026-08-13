import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  const isMulter = typeof err === "object" && err !== null && "code" in err;
  if (isMulter && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large" });
    return;
  }

  console.error("Unhandled error:", isProduction ? err instanceof Error ? err.name : "Error" : message);
  res.status(500).json({ error: "Internal server error" });
}
