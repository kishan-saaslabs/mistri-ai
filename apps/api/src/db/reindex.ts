#!/usr/bin/env tsx
/**
 * Re-chunks and re-embeds every transcription's named transcript using
 * whichever embedding provider/model is CURRENTLY configured in .env.
 *
 * Needed any time LLM_MODEL_EMBEDDING (or the provider) changes: vectors
 * from two different embedding models are not comparable even at the same
 * dimensionality — confirmed live that switching providers without
 * re-embedding produces retrieval that silently ignores query content
 * entirely (same-width vectors from an old model compared against a new
 * model's query vector is mathematically meaningless, not just "worse").
 * There is no in-place migration for this; a full re-embed is the fix.
 *
 * Usage: pnpm --filter @mistri-ai/api reindex
 */
import { KbIngestService } from "../services/kbIngestService.js";
import { CallTranscriptModel } from "../models/callTranscriptModel.js";

const rows = await CallTranscriptModel.listAllTranscriptionIds();
console.log(`Re-embedding ${rows.length} transcription(s)...`);

let ok = 0;
let failed = 0;
for (const { transcription_id: transcriptionId } of rows) {
  try {
    await KbIngestService.ingestForTranscription(transcriptionId);
    ok += 1;
    console.log(`  OK    ${transcriptionId}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : "unknown error";
    console.log(`  FAIL  ${transcriptionId} — ${message}`);
  }
}

console.log(`\n${ok} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
