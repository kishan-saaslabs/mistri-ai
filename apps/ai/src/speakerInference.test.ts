import assert from "node:assert/strict";
import { test } from "node:test";
import { MockClient } from "./llm/mockClient.js";
import { inferSpeakerNames } from "./speakerInference.js";
import type { Transcript } from "./types.js";

// There is no regex pre-pass anymore (see the comment on buildPrompt in
// speakerInference.ts for why) — every call now reaches the LLM exactly
// once (twice if the first response fails validation). What these tests
// verify is the harness around that call: the prompt is built correctly,
// jsonMode is NOT used (NIM's response_format enforcement is unreliable
// at scale — see chat/generate.ts), and the existing safety nets
// (duplicate-name rejection, hallucination rejection, positional
// fallback) still hold now that they're the only line of defense.
// Whether the LLM actually picks the right name out of ambiguous text is
// real-model judgment, not something a mock can prove — that's verified
// live, not here.

test("every call reaches the LLM exactly once, with the whole transcript and every label in the prompt", async () => {
  const transcript: Transcript = [
    { id: "1", type: "final", start: 0, end: 2, speaker: "speaker_1", text: "Yeah, so my name's Nick, calling about the invoice." },
    { id: "2", type: "final", start: 2, end: 4, speaker: "speaker_2", text: "Sure, let me pull that up for you." },
  ];

  const canned = JSON.stringify([
    { label: "speaker_1", suggestedName: "Nick", confidence: "high", evidence: "my name's Nick" },
    { label: "speaker_2", suggestedName: "Agent", confidence: "low", evidence: "no self-identification found" },
  ]);

  const client = new MockClient(canned);
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 1);

  const call = client.calls[0];
  assert.ok(call, "expected the LLM to have been called");
  const { messages, options } = call;
  const promptText = messages.map((message) => message.content).join("\n");
  assert.match(promptText, /speaker_1/);
  assert.match(promptText, /speaker_2/);
  assert.match(promptText, /my name's Nick/);
  assert.equal(options?.jsonMode, undefined, "jsonMode must not be set — NIM's response_format enforcement is unreliable at scale");
  assert.equal(options?.temperature, 0);

  assert.deepEqual(result, JSON.parse(canned));
});

test("rejects a response citing a label that was never asked about (hallucinated label)", async () => {
  const transcript: Transcript = [
    { id: "1", type: "final", start: 0, end: 2, speaker: "speaker_1", text: "Hello there." },
  ];
  const canned = JSON.stringify([{ label: "speaker_99", suggestedName: "Nick", confidence: "high", evidence: "n/a" }]);
  const client = new MockClient(canned);
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 2, "invalid response is retried once");
  assert.equal(result[0]?.confidence, "low", "degrades to the positional fallback after a second invalid response");
});

test("rejects the LLM assigning the same real name to two different speakers, then falls back to the positional fallback", async () => {
  // Reproduces a real reported bug: one speaker introduces herself AND
  // greets the other speaker by name in the same turn, and a small model
  // incorrectly attributed that same name to both.
  const transcript: Transcript = [
    { id: "1", type: "final", start: 0, end: 2, speaker: "speaker_1", text: "Hi, this is Devanshi, hi Rahul!" },
    { id: "2", type: "final", start: 2, end: 4, speaker: "speaker_2", text: "Hey Devanshi, good to hear from you." },
  ];

  // The (buggy) response the LLM would give: reuses "Devanshi" for both.
  const colliding = JSON.stringify([
    { label: "speaker_1", suggestedName: "Devanshi", confidence: "high", evidence: "this is Devanshi" },
    { label: "speaker_2", suggestedName: "Devanshi", confidence: "medium", evidence: "Hey Devanshi" },
  ]);

  const client = new MockClient(colliding);
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 2, "the colliding response should be rejected once, then retried once more");
  assert.equal(result[0]?.confidence, "low");
  assert.equal(result[1]?.confidence, "low");
  assert.notEqual(result[0]?.suggestedName.toLowerCase(), result[1]?.suggestedName.toLowerCase());
});

test("returns [] without calling the LLM when there's nothing eligible (all partial, or no diarization)", async () => {
  const transcript: Transcript = [
    { id: "1", type: "partial", start: 0, end: 2, speaker: "speaker_1", text: "Hello the" },
  ];
  const client = new MockClient("[]");
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 0);
  assert.deepEqual(result, []);
});
