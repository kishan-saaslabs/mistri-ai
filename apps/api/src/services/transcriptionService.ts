import { extname, resolve } from "node:path";
import {
  applySpeakerNames,
  getLLMClient,
  inferSpeakerNames,
  renderNamedTranscript,
  type InferredSpeaker,
  type NamedTranscript,
  type SpeakerMap,
} from "@mistri-ai/ai";
import { env } from "../config/env.js";
import { uploadRoot } from "../middleware/upload.js";
import { CallModel } from "../models/callModel.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";
import { TranscriptionModel, type TranscriptionRecord } from "../models/transcriptionModel.js";
import { publishCallInsightsJob } from "../queue/callInsightsQueue.js";
import { publishInferAndRenameJob } from "../queue/inferAndRenameQueue.js";
import { publishKbIngestJob } from "../queue/kbIngestQueue.js";
import { transcribeAudioFile } from "./pyaiHear.js";

export type InferAndRenameResult = {
  inferred: InferredSpeaker[];
  transcript: NamedTranscript;
  readable: string;
  reason?: string;
};

function toSpeakerMap(inferred: InferredSpeaker[]): SpeakerMap {
  return Object.fromEntries(inferred.map((item) => [item.label, item.suggestedName]));
}

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
      const result = await transcribeAudioFile(
        {
          absolutePath: resolve(uploadRoot, call.storage_path),
          filename,
          mimeType: mimeByExt[ext] ?? "application/octet-stream",
          audioUrl: call.source_url && /^https?:\/\//i.test(call.source_url) ? call.source_url : undefined,
        },
        {
          onJobSubmitted: async () => {
            await TranscriptionModel.markTranscribing(row.id);
          },
        },
      );

      const saved = await TranscriptionModel.markReady(row.id, {
        language: result.language,
        durationSeconds: result.durationSeconds,
        fullText: result.fullText,
        segments: result.segments,
      });
      if (!saved) {
        throw new Error("Could not save transcription");
      }

      const duration = result.durationSeconds != null ? Math.round(result.durationSeconds) : undefined;
      await CallModel.updateStatus(callId, "PYAI_SUCCESS", duration);

      try {
        await publishInferAndRenameJob({ callId, transcriptionId: saved.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue publish failed";
        console.error("Could not enqueue infer-and-rename:", message);
      }

      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed";
      await TranscriptionModel.markFailed(row.id, message);
      await CallModel.updateStatus(callId, "PYAI_FAILED");
      throw error;
    }
  },

  listForCall(callId: string) {
    return TranscriptionModel.listByCallId(callId);
  },

  async inferAndRenameSpeakers(transcription: TranscriptionRecord): Promise<InferAndRenameResult> {
    // Guard: only pick up transcriptions that are actually in PYAI_SUCCESS.
    // Checked on the transcription itself, not the call — a call can have
    // multiple transcription rows (retries), each with its own status, so
    // this is the precise thing to gate on. Blocks a stale/duplicate job
    // from re-running (or clobbering) LLM work for a transcription that
    // has moved on (already LLM_SUCCESS, never finished PyAI, or failed)
    // since the job was published.
    if (transcription.status !== "PYAI_SUCCESS") {
      const named = applySpeakerNames(transcription.segments, {});
      return {
        inferred: [],
        transcript: named,
        readable: renderNamedTranscript(named),
        reason: `transcription status is ${transcription.status}, expected PYAI_SUCCESS — skipping`,
      };
    }

    await TranscriptionModel.markLLMTranscribing(transcription.id);

    try {
      const segments = transcription.segments;

      if (segments.length === 0) {
        const named = applySpeakerNames(segments, {});
        await TranscriptionModel.markLLMSuccess(transcription.id);
        return {
          inferred: [],
          transcript: named,
          readable: renderNamedTranscript(named),
          reason: "transcription has no segments",
        };
      }

      if (!segments.some((segment) => segment.speaker !== null)) {
        const named = applySpeakerNames(segments, {});
        await TranscriptionModel.markLLMSuccess(transcription.id);
        return {
          inferred: [],
          transcript: named,
          readable: renderNamedTranscript(named),
          reason: "no diarization data available for this transcript",
        };
      }

      const cached = await CallTranscriptModel.findByTranscriptionId(transcription.id);
      if (cached) {
        await TranscriptionModel.markLLMSuccess(transcription.id);
        return {
          inferred: cached.inferred_speakers,
          transcript: cached.segments,
          readable: renderNamedTranscript(cached.segments),
        };
      }

      const client = getLLMClient();
      const inferred = await inferSpeakerNames(segments, client);
      const named = applySpeakerNames(segments, toSpeakerMap(inferred));
      const readable = renderNamedTranscript(named);
      await CallTranscriptModel.upsert({
        callId: transcription.call_id,
        transcriptionId: transcription.id,
        segments: named,
        inferredSpeakers: inferred,
      });

      // A fresh named transcript now exists — publish both downstream
      // pipeline stages. Not published on the cache-hit / short-circuit
      // paths above: those don't produce a new call_transcripts row, so
      // there'd be nothing new for either to read. The two are
      // independent of each other (neither call-insights extraction nor
      // KB chunking/embedding blocks the other) — a slow or failing one
      // must never hold up the other coming online.
      try {
        await publishCallInsightsJob({ callId: transcription.call_id, transcriptionId: transcription.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue publish failed";
        console.error("Could not enqueue call-insights:", message);
      }
      try {
        await publishKbIngestJob({ callId: transcription.call_id, transcriptionId: transcription.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue publish failed";
        console.error("Could not enqueue kb-ingest:", message);
      }

      await TranscriptionModel.markLLMSuccess(transcription.id);
      return { inferred, transcript: named, readable };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Speaker inference failed";
      await TranscriptionModel.markLLMFailed(transcription.id, message);
      throw error;
    }
  },
};
