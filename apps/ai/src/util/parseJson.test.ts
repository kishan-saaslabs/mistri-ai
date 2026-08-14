import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonLeniently } from "./parseJson.js";

test("parses clean JSON directly", () => {
  const result = parseJsonLeniently('{"answer":"hi","citations":[]}');
  assert.deepEqual(result, { answer: "hi", citations: [] });
});

test("recovers from a stray leading token before the real object — confirmed live against NVIDIA NIM", () => {
  const raw = '{"{"answer":"The objections raised across the calls include cost concerns.","citations":[]}';
  const result = parseJsonLeniently(raw);
  assert.deepEqual(result, { answer: "The objections raised across the calls include cost concerns.", citations: [] });
});

test("returns null (not a thrown error) for genuinely unparseable text", () => {
  const result = parseJsonLeniently("not json at all, no braces here");
  assert.equal(result, null);
});

test("does not accept trailing garbage after a valid object", () => {
  const result = parseJsonLeniently('{"answer":"hi"} some trailing prose the model added');
  assert.equal(result, null);
});

test("recovers a JSON array response (used by speakerInference/topic labeling) with leading noise, not just objects", () => {
  const result = parseJsonLeniently('garbage prefix [{"a":1}]');
  assert.deepEqual(result, [{ a: 1 }]);
});
