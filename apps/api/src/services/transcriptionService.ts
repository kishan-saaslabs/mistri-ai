import { extname, resolve } from "node:path";
import { env } from "../config/env.js";
import { uploadRoot } from "../middleware/upload.js";
import { CallModel } from "../models/callModel.js";
import { TranscriptionModel } from "../models/transcriptionModel.js";
import { transcribeAudioFile } from "./pyaiHear.js";

const mimeByExt: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "audio/webm",
};

export const TranscriptionService = {
  async transcribeCall(callId: string) {
    const call = await CallModel.findById(callId);
    if (!call?.storage_path) {
      throw new Error("Call recording is not available on disk");
    }

    const row = await TranscriptionModel.create({
      callId,
      provider: "pyai",
      model: env.PYAI_TRANSCRIBE_MODEL,
    });
    if (!row) {
      throw new Error("Could not create transcription row");
    }

    try {
      const filename = call.filename || call.storage_path;
      const ext = extname(filename).toLowerCase();
      const result = await transcribeAudioFile({
        absolutePath: resolve(uploadRoot, call.storage_path),
        filename,
        mimeType: mimeByExt[ext] ?? "application/octet-stream",
      });

      const saved = await TranscriptionModel.markReady(row.id, {
        language: result.language,
        durationSeconds: result.durationSeconds,
        fullText: result.fullText,
        segments: result.segments,
      });

      const duration = result.durationSeconds != null ? Math.round(result.durationSeconds) : undefined;
      await CallModel.updateStatus(callId, "ready", duration);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed";
      await TranscriptionModel.markFailed(row.id, message);
      await CallModel.updateStatus(callId, "failed");
      throw error;
    }
  },

  listForCall(callId: string) {
    return TranscriptionModel.listByCallId(callId);
  },
};
