import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";
import { ALLOWED_AUDIO_EXT, ALLOWED_AUDIO_MIME } from "../lib/audioFile.js";
import { HttpError } from "../utils/httpError.js";

export const uploadRoot = join(tmpdir(), "mistri-uploads");
mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_AUDIO_EXT.has(ext) ? ext : ".bin";
    cb(null, `${randomUUID()}${safeExt}`);
  },
});

export const callUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_AUDIO_MIME.has(file.mimetype) && !ALLOWED_AUDIO_EXT.has(ext)) {
      cb(new HttpError(400, "Unsupported file type. Use MP3, WAV, M4A, or MP4."));
      return;
    }
    cb(null, true);
  },
});
