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
    followUpEmail: { subject: "Following up", body: "Hi Priya, ...", confidence: "high", evidence: [{ segmentId: "seg_3", quote: "send over a follow-up" }] },
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

test("generateCallInsights rejects a quote that isn't actually in the cited segment (fabricated or spliced)", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "final", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "Let's go with the standard plan." },
    { id: "seg_2", type: "final", start: 2, end: 4, speaker: "speaker_2", speakerName: "Priya", text: "Sounds good to me, thanks." },
  ];

  // Real segment id, but the quote is spliced in from seg_2's text — not
  // actually present in seg_1, which is exactly the failure mode Fix #1's
  // substring check exists to catch.
  const splicedCanned = JSON.stringify({
    summary: [{ title: "x", text: "x", evidence: [{ segmentId: "seg_1", quote: "sounds good to me, thanks" }] }],
    objections: [],
    customerWants: [],
    nextSteps: [],
    followUpEmail: null,
  });

  const client = new MockClient(splicedCanned);

  await assert.rejects(() => generateCallInsights(transcript, client));
  assert.equal(client.calls.length, 2, "expected one initial call and one retry, both invalid");
});

test("generateCallInsights rejects an item with an empty evidence array instead of accepting it vacuously", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "final", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "Let's go with the standard plan." },
  ];

  const emptyEvidenceCanned = JSON.stringify({
    summary: [{ title: "x", text: "x", evidence: [] }],
    objections: [],
    customerWants: [],
    nextSteps: [],
    followUpEmail: null,
  });

  const client = new MockClient(emptyEvidenceCanned);

  await assert.rejects(() => generateCallInsights(transcript, client));
  assert.equal(client.calls.length, 2, "an empty evidence array must not pass validation vacuously");
});

test("generateCallInsights excludes partial segments from the prompt and never accepts them as citations", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "final", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "Let's go with the standard plan." },
    { id: "seg_2", type: "partial", start: 2, end: 4, speaker: "speaker_2", speakerName: "Priya", text: "wait actually i think we should" },
  ];

  const canned = JSON.stringify({
    summary: [{ title: "x", text: "x", evidence: [{ segmentId: "seg_1", quote: "let's go with the standard plan" }] }],
    objections: [],
    customerWants: [],
    nextSteps: [],
    followUpEmail: null,
  });

  const client = new MockClient(canned);
  const insights = await generateCallInsights(transcript, client);

  const call = client.calls[0];
  assert.ok(call);
  const promptText = call.messages.map((m) => m.content).join("\n");
  assert.doesNotMatch(promptText, /seg_2/, "partial segment id must never be rendered into the prompt");
  assert.doesNotMatch(promptText, /wait actually/, "partial segment text must never be rendered into the prompt");
  assert.equal(insights.summary[0]?.evidence[0]?.segmentId, "seg_1");
});

test("generateCallInsights skips the LLM call entirely when every segment is partial", async () => {
  const transcript: NamedTranscript = [
    { id: "seg_1", type: "partial", start: 0, end: 2, speaker: "speaker_1", speakerName: "Nick", text: "wait actually i think we should" },
  ];

  const client = new MockClient("should never be read");
  const insights = await generateCallInsights(transcript, client);

  assert.equal(client.calls.length, 0, "nothing reliable to reason about — the LLM should never be called");
  assert.deepEqual(insights, {
    summary: [],
    objections: [],
    customerWants: [],
    nextSteps: [],
    followUpEmail: null,
  });
});
