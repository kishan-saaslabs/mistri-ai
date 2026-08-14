/**
 * Confirmed live against NVIDIA NIM (both a small instruct model and a
 * larger reasoning model, in json_object response-format mode): a raw
 * completion can arrive with a stray leading token before the real JSON
 * object — e.g. `{"{"answer":"..."}` instead of `{"answer":"..."}`. The
 * whole string is genuinely invalid JSON, but the object starting at the
 * SECOND `{` is well-formed. A naive `JSON.parse(raw)` throws and the
 * caller has no way to tell "the model said something ungrounded" apart
 * from "the model said the right thing, wrapped oddly" — the latter was
 * costing two full failed generation attempts (each a real network round
 * trip) before falling back, which is what made deal-scoped chat turns
 * take 30+ seconds for a well-formed answer that was sitting right there.
 *
 * Tries the raw string first (the common, clean case — zero overhead),
 * then each `{` position in order as a candidate object start. Never
 * silently accepts trailing garbage after a valid object — `JSON.parse`
 * itself still rejects that once given the right start position.
 */
// Both '{' and '[' are tried — speakerInference.ts and topics.ts expect a
// top-level JSON array, callInsights.ts and chat/generate.ts expect a
// top-level object, and this helper is shared across all four.
function candidateStarts(raw: string): number[] {
  const positions: number[] = [];
  for (const char of ["{", "["]) {
    for (let i = raw.indexOf(char); i !== -1; i = raw.indexOf(char, i + 1)) {
      positions.push(i);
    }
  }
  return positions.sort((a, b) => a - b);
}

export function parseJsonLeniently(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to positional retry below
  }

  for (const i of candidateStarts(raw)) {
    try {
      return JSON.parse(raw.slice(i));
    } catch {
      continue;
    }
  }

  return null;
}
