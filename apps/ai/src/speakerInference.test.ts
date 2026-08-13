import assert from "node:assert/strict";
import { test } from "node:test";
import { MockClient } from "./llm/mockClient.js";
import { inferSpeakerNames } from "./speakerInference.js";
import type { Transcript } from "./types.js";

test("regex pre-pass resolves an obvious self-introduction without ever calling the LLM", async () => {
  const transcript: Transcript = [
    { id: "1", type: "final", start: 0, end: 2, speaker: "speaker_1", text: "Hey, this is Nick calling about the invoice." },
    { id: "2", type: "final", start: 2, end: 4, speaker: "speaker_2", text: "Hi, this is Priya, let me pull that up." },
  ];

  const client = new MockClient("[]");
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 0, "both speakers self-identify via regex, so the LLM should never be called");
  assert.deepEqual(
    result.map((r) => [r.label, r.suggestedName]).sort(),
    [
      ["speaker_1", "Nick"],
      ["speaker_2", "Priya"],
    ],
  );
});

test("falls back to the LLM (via a mock client) when the regex pre-pass can't resolve a speaker", async () => {
  // Deliberately avoids the deterministic regex patterns ("this is X" / "X here" / "I'm X")
  // so both labels reach the LLM — this is what actually proves inferSpeakerNames has zero
  // dependency on any real network call or vendor: it works identically against this mock.
  const transcript: Transcript = [
    {
      id: "1",
      type: "final",
      start: 0,
      end: 2,
      speaker: "speaker_1",
      text: "Yeah, so my name's Nick, calling about the invoice.",
    },
    { id: "2", type: "final", start: 2, end: 4, speaker: "speaker_2", text: "Sure, let me pull that up for you." },
  ];

  const canned = JSON.stringify([
    { label: "speaker_1", suggestedName: "Nick", confidence: "high", evidence: "my name's Nick" },
    { label: "speaker_2", suggestedName: "Agent", confidence: "low", evidence: "no self-identification found" },
  ]);

  const client = new MockClient(canned);
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 1, "neither speaker matches the regex pre-pass, so exactly one LLM call is expected");

  const call = client.calls[0];
  assert.ok(call, "expected the LLM to have been called");
  const { messages, options } = call;
  const promptText = messages.map((message) => message.content).join("\n");
  assert.match(promptText, /speaker_1/);
  assert.match(promptText, /speaker_2/);
  assert.match(promptText, /my name's Nick/);
  assert.equal(options?.jsonMode, true);
  assert.equal(options?.temperature, 0);

  assert.deepEqual(result, JSON.parse(canned));
});

test("rejects the LLM reusing an already-resolved name for a different speaker, falling back instead of duplicating it", async () => {
  // Reproduces a real reported bug: speaker_1 introduces herself AND greets
  // speaker_2 by name in the same turn ("this is Devanshi" resolves via
  // regex), speaker_2's reply doesn't match any self-intro pattern so it
  // falls to the LLM — which (like a real small model did) incorrectly
  // attributes "Devanshi" to speaker_2 as well.
  const transcript: Transcript = [
    { id: "1", type: "final", start: 0, end: 2, speaker: "speaker_1", text: "Hi, this is Devanshi, hi Rahul!" },
    { id: "2", type: "final", start: 2, end: 4, speaker: "speaker_2", text: "Hey Devanshi, good to hear from you." },
  ];

  // The (buggy) response the LLM would give: reuses "Devanshi" for speaker_2.
  const colliding = JSON.stringify([
    { label: "speaker_2", suggestedName: "Devanshi", confidence: "medium", evidence: "Hey Devanshi" },
  ]);

  const client = new MockClient(colliding);
  const result = await inferSpeakerNames(transcript, client);

  assert.equal(client.calls.length, 2, "the colliding response should be rejected once, then retried once more");

  const speaker1 = result.find((r) => r.label === "speaker_1");
  const speaker2 = result.find((r) => r.label === "speaker_2");
  assert.equal(speaker1?.suggestedName, "Devanshi", "speaker_1 correctly resolved via regex");
  assert.notEqual(
    speaker2?.suggestedName.toLowerCase(),
    "devanshi",
    "speaker_2 must not end up with the same real name as a different speaker",
  );
  assert.equal(speaker2?.confidence, "low", "double-invalid response should degrade to the positional fallback");
});
