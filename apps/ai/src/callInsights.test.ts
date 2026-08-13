import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCallInsights } from "./callInsights.js";
import { MockClient } from "./llm/mockClient.js";
import type { NamedTranscript } from "./types.js";

test("generateCallInsights parses a valid grounded response from the LLM", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "final", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "Hi, this is Nick from support." },
    { id: "seg_2", type: "final", start: 2, end: 5, speaker: "speaker_2", speakerName: "Priya", text: "We're not happy with the current pricing tier." },
    { id: "seg_3", type: "final", start: 5, end: 8, speaker: "speaker_1", speakerName: "Nick", text: "I'll send over a follow-up with a discount option." },
  ];

  const canned = JSON.stringify({
    summary: [{ title: "Pricing concern raised", text: "Priya raised a pricing concern.", evidence: [{ segmentId: "seg_2", quote: "not happy with the current pricing tier" }] }],
    objections: [{ title: "Price too high", text: "Customer feels the price is too high.", evidence: [{ segmentId: "seg_2", quote: "not happy with the current pricing tier" }] }],
    customerWants: [{ label: "A lower price", confidence: "high", evidence: [{ segmentId: "seg_2", quote: "not happy with the current pricing tier" }] }],
    nextSteps: [{ text: "Send a discount option", owner: "Nick", evidence: [{ segmentId: "seg_3", quote: "send over a follow-up with a discount option" }] }],
    followUpEmail: { subject: "Following up", body: "Hi Priya, ...", evidence: [{ segmentId: "seg_3", quote: "send over a follow-up" }] },
  });

  const client = new MockClient(canned);
  const insights = await generateCallInsights(transcript, client);

  assert.equal(client.calls.length, 1);
  const call = client.calls[0];
  assert.ok(call);
  assert.equal(call.options?.jsonMode, true);
  assert.equal(call.options?.temperature, 0);
  assert.deepEqual(insights, JSON.parse(canned));
});

test("generateCallInsights retries once then throws on a response citing a hallucinated segment id", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "final", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "Hi, this is Nick." },
  ];

  const badCanned = JSON.stringify({
    summary: [{ title: "x", text: "x", evidence: [{ segmentId: "seg_999", quote: "not in the transcript" }] }],
    objections: [],
    customerWants: [],
    nextSteps: [],
    followUpEmail: null,
  });

  const client = new MockClient(badCanned);

  await assert.rejects(() => generateCallInsights(transcript, client));
  assert.equal(client.calls.length, 2, "expected one initial call and one retry, both invalid");
});
