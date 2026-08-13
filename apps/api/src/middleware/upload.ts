import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const allowedMime = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "video/mp4",
]);

const allowedExt = new Set([".mp3", ".wav", ".m4a", ".mp4", ".webm"]);

export const uploadRoot = resolve(process.cwd(), env.UPLOAD_DIR);
mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const safeExt = allowedExt.has(ext) ? ext : ".bin";
    cb(null, `${randomUUID()}${safeExt}`);
  },
});

export const callUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!allowedMime.has(file.mimetype) && !allowedExt.has(ext)) {
      cb(new HttpError(400, "Unsupported file type. Use MP3, WAV, M4A, or MP4."));
      return;
    }
    cb(null, true);
  },
});
