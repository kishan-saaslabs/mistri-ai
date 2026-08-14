import { generateCallInsights, getInsightsLLMClient } from "@mistri-ai/ai";
import { CallInsightModel } from "../models/callInsightModel.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";

export const CallInsightService = {
  async generateForTranscription(transcriptionId: string) {
    const cached = await CallInsightModel.findByTranscriptionId(transcriptionId);
    // Only a completed SUCCESS counts as cached — a stuck PROCESSING row
    // (e.g. a prior crash mid-generation) or a previous FAILED attempt
    // both fall through to a fresh attempt below, which self-heals either
    // case via the same upsert-to-PROCESSING call.
    if (cached?.status === "SUCCESS") {
      return cached;
    }

    const namedTranscript = await CallTranscriptModel.findByTranscriptionId(transcriptionId);
    if (!namedTranscript) {
      throw new Error(
        `No call_transcripts row for transcription ${transcriptionId} — speaker-name inference must succeed before insights can be generated`,
      );
    }

    await CallInsightModel.markProcessing({
      callId: namedTranscript.call_id,
      transcriptionId,
    });

    try {
      const client = getInsightsLLMClient();
      const insights = await generateCallInsights(namedTranscript.segments, client);

      const saved = await CallInsightModel.markSuccess({
        transcriptionId,
        summary: insights.summary,
        objections: insights.objections,
        customerWants: insights.customerWants,
        nextSteps: insights.nextSteps,
        followUpEmail: insights.followUpEmail,
      });
      if (!saved) {
        throw new Error(`Could not save call insights for transcription ${transcriptionId}`);
      }
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Call insight generation failed";
      await CallInsightModel.markFailed(transcriptionId, message);
      throw error;
    }
  },

  getForTranscription(transcriptionId: string) {
    return CallInsightModel.findByTranscriptionId(transcriptionId);
  },
};
