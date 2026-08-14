import assert from "node:assert/strict";
import { test } from "node:test";
import type { NamedTranscript } from "../types.js";
import { windowTranscript } from "./windower.js";

function seg(id: string, speaker: string, text: string, speakerName = speaker): NamedTranscript[number] {
  return { id, type: "final", start: null, end: null, speaker, text, speakerName };
}

test("degenerate case: a handful of short turns produce exactly one chunk", () => {
  const transcript: NamedTranscript = [
    seg("1", "speaker_1", "Hey, quick one — can we push to Friday?"),
    seg("2", "speaker_2", "Yeah, Friday works."),
    seg("3", "speaker_1", "Great, thanks."),
    seg("4", "speaker_2", "No problem."),
  ];

  const chunks = windowTranscript(transcript);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0]?.segmentIds, ["1", "2", "3", "4"]);
});

test("union of all chunks' segmentIds equals the full utterance set — no utterance is ever lost", () => {
  const transcript: NamedTranscript = Array.from({ length: 60 }, (_, i) =>
    seg(
      String(i),
      i % 2 === 0 ? "speaker_1" : "speaker_2",
      `This is utterance number ${i}, with enough words in it to actually count toward the token target instead of being a short acknowledgement turn.`,
    ),
  );

  const chunks = windowTranscript(transcript);
  const covered = new Set(chunks.flatMap((c) => c.segmentIds));

  assert.equal(covered.size, transcript.length);
  for (const s of transcript) {
    assert.ok(covered.has(s.id), `utterance ${s.id} must be covered by some chunk`);
  }
});

test("partial (unfinalized) segments are excluded entirely", () => {
  const transcript: NamedTranscript = [
    seg("1", "speaker_1", "This one is final."),
    { ...seg("2", "speaker_2", "This one never finished"), type: "partial" },
    seg("3", "speaker_1", "This one is also final."),
  ];

  const chunks = windowTranscript(transcript);
  const covered = new Set(chunks.flatMap((c) => c.segmentIds));

  assert.ok(!covered.has("2"));
  assert.ok(covered.has("1"));
  assert.ok(covered.has("3"));
});

test("a single turn over maxTokens splits on sentence boundaries and both halves keep the same segment id", () => {
  const longSentence = (n: number) =>
    `This is sentence number ${n} of a very long monologue that just keeps going on and on about the quarterly roadmap, the budget approval process, the security review timeline, and every other topic that came up during this unusually long single turn from one speaker who did not stop talking for a very long time. `;

  const longText = Array.from({ length: 40 }, (_, i) => longSentence(i)).join("");

  const transcript: NamedTranscript = [
    seg("1", "speaker_1", "Setting the stage first."),
    seg("2", "speaker_2", longText),
    seg("3", "speaker_1", "Thanks for the update."),
  ];

  const chunks = windowTranscript(transcript);
  const splitChunks = chunks.filter((c) => c.segmentIds.length === 1 && c.segmentIds[0] === "2");

  assert.ok(splitChunks.length > 1, "the over-long turn should split into more than one chunk");
  for (const c of splitChunks) {
    assert.deepEqual(c.segmentIds, ["2"]);
    // The chat evidence gate must never validate a citation against the
    // full original segment text — only against this exact chunk's body.
    // Confirm the two split chunks actually hold DIFFERENT text, which is
    // what makes that distinction matter in the first place.
  }
  const bodies = new Set(splitChunks.map((c) => c.body));
  assert.equal(bodies.size, splitChunks.length, "each split part must hold distinct text");

  // The turns before and after the over-long one must not be silently dropped.
  const covered = new Set(chunks.flatMap((c) => c.segmentIds));
  assert.ok(covered.has("1"));
  assert.ok(covered.has("3"));
});

test("chunk body renders the raw speaker label, not a resolved display name", () => {
  const transcript: NamedTranscript = [seg("1", "speaker_1", "Hello there.", "Nick Alvarez")];
  const chunks = windowTranscript(transcript);
  assert.match(chunks[0]?.body ?? "", /^speaker_1:/);
  assert.doesNotMatch(chunks[0]?.body ?? "", /Nick Alvarez/);
});
