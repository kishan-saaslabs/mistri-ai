import { generateCallInsights, getLLMClient } from "@mistri-ai/ai";
import { CallInsightModel } from "../models/callInsightModel.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";

export const CallInsightService = {
  async generateForTranscription(transcriptionId: string) {
    const cached = await CallInsightModel.findByTranscriptionId(transcriptionId);
    if (cached) {
      return cached;
    }

    const namedTranscript = await CallTranscriptModel.findByTranscriptionId(transcriptionId);
    if (!namedTranscript) {
      throw new Error(
        `No call_transcripts row for transcription ${transcriptionId} — speaker-name inference must succeed before insights can be generated`,
      );
    }

    const client = getLLMClient();
    const insights = await generateCallInsights(namedTranscript.segments, client);

    return CallInsightModel.upsert({
      callId: namedTranscript.call_id,
      transcriptionId,
      summary: insights.summary,
      objections: insights.objections,
      customerWants: insights.customerWants,
      nextSteps: insights.nextSteps,
      followUpEmail: insights.followUpEmail,
    });
  },
};
