import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCitations, type ShownContext } from "./validateCitations.js";

test("accepts a citation whose quote is an exact substring of its own chunk's shown text", () => {
  const shownContext = new Map<string, ShownContext>([
    ["chunk-1", { shownText: "speaker_1: we need a pen-test report.", segmentIds: ["seg-1"], attributionUncertain: false }],
  ]);
  const result = validateCitations(
    [{ chunkId: "chunk-1", segmentId: "seg-1", quote: "we need a pen-test report" }],
    shownContext,
  );
  assert.equal(result.validCitations.length, 1);
  assert.equal(result.droppedCount, 0);
});

test("rejects a citation quoting text from a DIFFERENT chunk than the one it's attributed to — the split-turn case", () => {
  // Both halves of an over-long turn share the same segment id, but hold
  // DIFFERENT text. A citation must be checked against its own chunk's
  // shown text, never the other half's — otherwise a model could quote
  // the second half while citing the first half's chunkId and still pass.
  const shownContext = new Map<string, ShownContext>([
    ["chunk-first-half", { shownText: "speaker_2: first half of the monologue.", segmentIds: ["seg-2"], attributionUncertain: false }],
    ["chunk-second-half", { shownText: "speaker_2: second half of the monologue.", segmentIds: ["seg-2"], attributionUncertain: false }],
  ]);

  const result = validateCitations(
    [{ chunkId: "chunk-first-half", segmentId: "seg-2", quote: "second half of the monologue" }],
    shownContext,
  );

  assert.equal(result.validCitations.length, 0, "the citation must be rejected");
  assert.equal(result.droppedCount, 1);
});

test("rejects a citation whose chunkId was never actually in context (hallucinated id)", () => {
  const shownContext = new Map<string, ShownContext>([
    ["chunk-1", { shownText: "some real text", segmentIds: ["seg-1"], attributionUncertain: false }],
  ]);
  const result = validateCitations([{ chunkId: "chunk-999", segmentId: "seg-1", quote: "some real text" }], shownContext);
  assert.equal(result.validCitations.length, 0);
});

test("rejects a citation pairing a real chunkId with a segmentId that doesn't belong to it", () => {
  const shownContext = new Map<string, ShownContext>([
    ["chunk-1", { shownText: "speaker_1: hello there", segmentIds: ["seg-1"], attributionUncertain: false }],
  ]);
  const result = validateCitations([{ chunkId: "chunk-1", segmentId: "seg-999", quote: "hello there" }], shownContext);
  assert.equal(result.validCitations.length, 0);
});

test("surfaces attributionUncertain when a surviving citation's chunk was flagged uncertain", () => {
  const shownContext = new Map<string, ShownContext>([
    ["chunk-1", { shownText: "speaker_1: hello there", segmentIds: ["seg-1"], attributionUncertain: true }],
  ]);
  const result = validateCitations([{ chunkId: "chunk-1", segmentId: "seg-1", quote: "hello there" }], shownContext);
  assert.equal(result.validCitations.length, 1);
  assert.equal(result.anyAttributionUncertain, true);
});
