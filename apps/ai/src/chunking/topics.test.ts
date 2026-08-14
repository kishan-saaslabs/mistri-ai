import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chunk, NamedTranscript } from "../types.js";
import { constrainTopics, detectCandidateBoundaries, parseTopicLabels } from "./topics.js";

function chunk(seq: number, segmentIds: string[], tokenCount: number): Chunk {
  return {
    tier: "turn_window",
    seq,
    body: segmentIds.join(" "),
    segmentIds,
    anchorSegmentId: segmentIds[0] ?? null,
    tokenCount,
    attributionUncertain: false,
  };
}

function seg(id: string, text: string, start: number | null = null, end: number | null = null): NamedTranscript[number] {
  return { id, type: "final", start, end, speaker: "speaker_1", text, speakerName: "speaker_1" };
}

test("a single chunk produces exactly one topic group, no split", () => {
  const chunks = [chunk(0, ["1"], 40)];
  const embeddings = [[1, 0, 0]];
  const transcript: NamedTranscript = [seg("1", "Hello.")];

  const signals = detectCandidateBoundaries(chunks, embeddings, transcript);
  const groups = constrainTopics(chunks, embeddings, signals);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.chunkIndices, [0]);
});

test("groups under minTopicTokens merge into the semantically closer neighbour", () => {
  // Three chunks, each its own "candidate" boundary, all well under the
  // 600-token floor individually — they must all merge into one group.
  const chunks = [chunk(0, ["1"], 100), chunk(1, ["2"], 100), chunk(2, ["3"], 100)];
  const embeddings = [
    [1, 0],
    [0.9, 0.1],
    [0.2, 0.9],
  ];
  const transcript: NamedTranscript = [seg("1", "a"), seg("2", "b"), seg("3", "c")];

  const signals = detectCandidateBoundaries(chunks, embeddings, transcript);
  const groups = constrainTopics(chunks, embeddings, signals);

  const totalTokens = groups.reduce((sum, g) => sum + g.chunkIndices.reduce((s, i) => s + chunks[i]!.tokenCount, 0), 0);
  assert.equal(totalTokens, 300, "no chunk should be lost while merging");
  for (const g of groups) {
    const tokens = g.chunkIndices.reduce((s, i) => s + chunks[i]!.tokenCount, 0);
    assert.ok(tokens >= 300 || groups.length === 1, "each group should have merged up toward the floor");
  }
});

test("gap signal is disabled entirely when timestamps are absent", () => {
  const chunks = [chunk(0, ["1"], 100), chunk(1, ["2"], 100)];
  const embeddings = [
    [1, 0],
    [1, 0],
  ];
  const transcript: NamedTranscript = [seg("1", "a", null, null), seg("2", "b", null, null)];

  const signals = detectCandidateBoundaries(chunks, embeddings, transcript);
  for (const sigs of signals.values()) {
    assert.ok(!sigs.includes("gap"));
  }
});

test("a >20s silence gap is detected as a boundary signal", () => {
  const chunks = [chunk(0, ["1"], 100), chunk(1, ["2"], 100)];
  const embeddings = [
    [1, 0],
    [1, 0],
  ];
  const transcript: NamedTranscript = [seg("1", "a", 0, 1000), seg("2", "b", 30_000, 31_000)];

  const signals = detectCandidateBoundaries(chunks, embeddings, transcript);
  assert.ok(signals.get(1)?.includes("gap"));
});

test("parseTopicLabels rejects a response with the wrong count", () => {
  const result = parseTopicLabels(JSON.stringify([{ seq: 0, label: "a", summary: "b" }]), 2);
  assert.equal(result, null);
});

test("parseTopicLabels accepts a bare object (not array-wrapped) when exactly one segment is expected", () => {
  const raw = JSON.stringify({ seq: 0, label: "Opening", summary: "They say hello." });
  const result = parseTopicLabels(raw, 1);
  assert.deepEqual(result, [{ seq: 0, label: "Opening", summary: "They say hello." }]);
});

test("parseTopicLabels does NOT apply the bare-object leniency when more than one segment is expected", () => {
  const raw = JSON.stringify({ seq: 0, label: "Opening", summary: "They say hello." });
  const result = parseTopicLabels(raw, 2);
  assert.equal(result, null);
});

test("parseTopicLabels accepts a well-formed response", () => {
  const raw = JSON.stringify([
    { seq: 0, label: "Pricing", summary: "Discussed the quote." },
    { seq: 1, label: "Security", summary: "Talked about SOC 2." },
  ]);
  const result = parseTopicLabels(raw, 2);
  assert.equal(result?.length, 2);
});
