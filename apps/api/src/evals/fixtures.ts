/**
 * Minimal hand-labeled eval set (see the KB chat plan's "Required
 * immediately after v1 ships" section). Deliberately smaller than the
 * spec's aspirational 15-20 calls — these are the real calls already in
 * this dev database from earlier live testing, chosen because three of
 * them are live, confirmed instances of the exact failure modes this
 * session found (not hypothetical adversarial cases):
 *
 * - `sorry-mistaken-for-name`: speaker-name inference assigned "sorry" as
 *   a display name (from "...I'm sorry, where are you from...") — a real,
 *   confidently-wrong (confidence: "high") misattribution, not fixed by
 *   this session's work. Included to document a known, open limitation:
 *   attribution-confidence tracks the model's self-reported certainty
 *   about name resolution, not correctness — a wrong name asserted
 *   confidently isn't caught anywhere in this pipeline.
 * - `merged-single-speaker`: every segment in the call is attributed to
 *   one speaker label despite the content reading as a two-party
 *   conversation — the "two speakers merged under one label" failure mode
 *   from this session, also at high confidence. Same open limitation.
 * - `mixed-confidence`: a real call with two high-confidence speakers and
 *   one low-confidence one, used to check attribution_uncertain fires
 *   precisely on the low-confidence speaker's content and nowhere else.
 *
 * Grow this list over time — this file, not a one-off script, is meant to
 * be the running record.
 */
export type EvalCase = {
  name: string;
  callId: string;
  transcriptionId: string;
  query: string;
  /** At least one citation's segmentId should be in this set, if any citations are expected at all. */
  expectedSegmentIds?: string[];
  /** Case-insensitive substrings expected somewhere in the answer text. */
  expectAnswerContains?: string[];
  expectAttributionUncertain?: boolean;
  expectNoCitations?: boolean;
  note: string;
};

export const EVAL_CASES: EvalCase[] = [
  {
    name: "clean-call-shipping-question",
    callId: "3d0163de-98fb-45d7-a7a6-85231b96fbc5",
    transcriptionId: "0387886f-ec21-4d69-a3b9-75227b63ba84",
    // NOTE: originally worded "What did the customer ASK about regarding
    // shipping?" — a false premise (confirmed live via 3 repeated runs):
    // speaker_2 (the agent) asks about the shipping address; speaker_1
    // (the customer) only answers, never asks anything. The model
    // correctly refused to fabricate a "customer asked X" claim on 2 of 3
    // runs (zero citations, L5's "nothing fabricated in the empty case"
    // working exactly as intended) and produced a real, grounded citation
    // to a DIFFERENT-but-still-valid interpretation on the third. That
    // was this fixture being wrong, not the pipeline — reworded to match
    // what's actually in the transcript.
    query: "What did the agent ask the customer about their shipping address?",
    expectedSegmentIds: ["seg_18", "seg_20"],
    expectAnswerContains: ["shipping"],
    note: "Baseline: a well-behaved call, a specific verbatim-quote question with known-correct expected segments.",
  },
  {
    name: "clean-call-structured-lite-objections",
    callId: "3d0163de-98fb-45d7-a7a6-85231b96fbc5",
    transcriptionId: "0387886f-ec21-4d69-a3b9-75227b63ba84",
    query: "What were the objections on this call?",
    expectNoCitations: true,
    expectAnswerContains: ["available"],
    note: "call_insights generation FAILED for this call previously — the router must not fabricate objections; it should say insights aren't available.",
  },
  {
    name: "clean-call-whole-call-summary",
    callId: "3d0163de-98fb-45d7-a7a6-85231b96fbc5",
    transcriptionId: "0387886f-ec21-4d69-a3b9-75227b63ba84",
    query: "Can you summarize this call?",
    expectAnswerContains: ["argon"],
    note: "Regression case for the contextualize bug found live: 'this call' must not be treated as a dependence signal needing history, and must route WHOLE_CALL, not get hijacked into re-answering a prior turn's topic.",
  },
  {
    name: "mixed-confidence-low-confidence-speaker-content",
    callId: "3a7cd661-340c-47a8-971b-3214342324fa",
    transcriptionId: "612e41cc-7ad2-4c3c-91d8-15a31193f38d",
    query: "Who is Gavin?",
    expectedSegmentIds: ["seg_3"],
    expectAttributionUncertain: true,
    note: "seg_3 ('hi gavin cran') belongs to the one low-confidence speaker (confidence: low, positional fallback) on an otherwise high-confidence call — attribution_uncertain must fire for this specific answer.",
  },
  {
    name: "mixed-confidence-high-confidence-speaker-content",
    callId: "3a7cd661-340c-47a8-971b-3214342324fa",
    transcriptionId: "612e41cc-7ad2-4c3c-91d8-15a31193f38d",
    query: "What seasonal mood problems does Seed and Sprout address?",
    expectAttributionUncertain: false,
    note: "Content from the high-confidence speaker's chunk (segIds 5-7, verified clean of the low-confidence speaker's turns) — attribution_uncertain must NOT fire here, proving the flag is precise per-chunk, not a blanket per-call flag. (Note: earlier wording of this query retrieved a DIFFERENT, later chunk that legitimately also contains one of the low-confidence speaker's short acknowledgement turns folded in by the windower's short-turn-merge rule — that was a wrong eval expectation on a correctly-conservative flag, not a code bug; this query targets a chunk confirmed not to have that overlap.)",
  },
  {
    name: "known-limitation-sorry-mistaken-for-name",
    callId: "3fe6d33c-27a2-4701-930c-c2aeada2442b",
    transcriptionId: "65d63a20-d057-48d6-af60-df457b323436",
    query: "What did the caller say when they introduced themselves?",
    // seg_2 has the actual misheard-name text; seg_3 continues the same
    // introduction/demo-request exchange — either is a legitimately
    // grounded answer to this question, confirmed live.
    expectedSegmentIds: ["seg_2", "seg_3"],
    expectAttributionUncertain: false,
    note:
      "KNOWN OPEN LIMITATION, not fixed: speaker-name inference assigned the display name \"sorry\" here — " +
      "confidently wrong (confidence: high), so attribution_uncertain does NOT fire despite the name being wrong. " +
      "This case exists to keep that gap visible, not to assert it's acceptable. What DOES still hold: the citation " +
      "must point at the real segment/quote regardless of the wrong name. OBSERVED FLAKY, not a hard gate: on one " +
      "run the model answered with an exact, correctly-quoted excerpt but its citation attempt was malformed and " +
      "correctly rejected by the gate (citationsDropped: 1, citations: []) — temperature 0 doesn't guarantee " +
      "identical citation-compliance behavior every run. That's a real characteristic of this pipeline to track over " +
      "time (per the plan), not a bug to silence by weakening this check.",
  },
  {
    name: "known-limitation-merged-single-speaker-label",
    callId: "d6b62e7f-20d2-4f54-a44c-1469bc92ea0a",
    transcriptionId: "a2b5c463-3b02-46c4-a4eb-5eb61cd9d8c1",
    query: "What did they say about calling back later?",
    expectedSegmentIds: ["seg_5", "seg_6"],
    expectAttributionUncertain: false,
    note: "KNOWN OPEN LIMITATION, not fixed: every segment in this call is attributed to one speaker label despite the content reading as two people talking — high confidence, so attribution_uncertain does not fire. Exists to keep the gap visible. What DOES still hold: citation grounding is unaffected by the naming error.",
  },
];
