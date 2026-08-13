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
