import type { InferredSpeaker, NamedTranscript } from "@mistri-ai/ai";
import { query, queryOne } from "../config/database.js";

export type CallTranscriptRecord = {
  id: string;
  call_id: string;
  transcription_id: string;
  segments: NamedTranscript;
  inferred_speakers: InferredSpeaker[];
  created_at: Date;
  updated_at: Date;
};

export const CallTranscriptModel = {
  findByTranscriptionId(transcriptionId: string) {
    return queryOne<CallTranscriptRecord>(
      "SELECT * FROM call_transcripts WHERE transcription_id = $1",
      [transcriptionId],
    );
  },

  listByCallId(callId: string) {
    return query<CallTranscriptRecord>(
      "SELECT * FROM call_transcripts WHERE call_id = $1 ORDER BY created_at DESC",
      [callId],
    );
  },

  // Upsert on transcription_id: a race between two concurrent
  // infer-and-rename requests for the same transcription should not
  // throw on the UNIQUE constraint — the second write just overwrites
  // with its own (equally valid) result.
  upsert(input: {
    callId: string;
    transcriptionId: string;
    segments: NamedTranscript;
    inferredSpeakers: InferredSpeaker[];
  }) {
    return queryOne<CallTranscriptRecord>(
      `INSERT INTO call_transcripts (call_id, transcription_id, segments, inferred_speakers)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (transcription_id) DO UPDATE
         SET segments = EXCLUDED.segments,
             inferred_speakers = EXCLUDED.inferred_speakers,
             updated_at = NOW()
       RETURNING *`,
      [
        input.callId,
        input.transcriptionId,
        JSON.stringify(input.segments),
        JSON.stringify(input.inferredSpeakers),
      ],
    );
  },
};
