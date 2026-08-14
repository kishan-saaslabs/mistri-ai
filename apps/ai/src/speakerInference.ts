import type { LLMClient } from "./llm/llmClient.js";
import type { InferredSpeaker, Transcript, TranscriptSegment } from "./types.js";
import { parseJsonLeniently } from "./util/parseJson.js";

// These are the exact role-guess fallbacks the prompt instructs the model
// to use when there's no evidence for a name — two different unnamed
// speakers legitimately CAN both end up "Agent". A real name can't: no
// two distinct diarized speakers on one call are the same named person,
// so a repeated real name is a strong signal the model conflated two
// speakers (e.g. one speaker greets the other by name mid-turn, and a
// small model attributes that name to the wrong speaker).
const GENERIC_ROLE_NAMES = new Set(["agent", "customer", "caller"]);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

type EligibleSegment = TranscriptSegment & { speaker: string; type: "final" };

/**
 * Segments with speaker === null have nothing nameable and can't be
 * grouped by label. Segments with type !== "final" are provisional /
 * possibly-truncated text (pyaiHear.ts preserves whatever the provider
 * marked as "partial", and a status: 'ready' transcription can still
 * contain individual partial segments — e.g. a trailing utterance that
 * never finalized). Feeding either into the LLM risks a wrong or garbled
 * name carrying the same confidence as a clean segment, so both are
 * excluded from the inference input entirely.
 */
function isEligible(segment: TranscriptSegment): segment is EligibleSegment {
  return segment.speaker !== null && segment.type === "final";
}

function distinctLabelsInOrder(segments: EligibleSegment[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const segment of segments) {
    if (!seen.has(segment.speaker)) {
      seen.add(segment.speaker);
      labels.push(segment.speaker);
    }
  }
  return labels;
}

function renderTranscriptBlock(segments: EligibleSegment[]): string {
  return segments.map((segment, index) => `${index + 1}. [${segment.speaker}] ${segment.text}`).join("\n");
}

/**
 * Confirmed live: on a long transcript where a speaker has few total
 * turns, their one crucial opening line (often the only self-introduction
 * evidence that exists) loses out to "lost in the middle" attention decay
 * — a model correctly extracted a name spoken on turn 7 of 29, but missed
 * an equally explicit self-introduction sitting in turn 1, even
 * responding with evidence: "self-introduction" while still falling back
 * to a role guess instead of the name. Re-surfacing each label's own
 * first line right next to the resolution instruction — where recency
 * gives it full attention weight regardless of overall transcript length
 * — is a prompt-structure fix, not a pattern-matching one: the model
 * still does all the judgment, it just isn't fighting transcript length
 * to find the most relevant sentence for each label.
 */
function firstUtteranceByLabel(segments: EligibleSegment[], labels: string[]): string {
  return labels
    .map((label) => {
      const first = segments.find((s) => s.speaker === label);
      return first ? `${label}: ${first.text}` : null;
    })
    .filter((line): line is string => !!line)
    .join("\n");
}

/**
 * There is deliberately no regex pre-pass here anymore. It used to try to
 * shortcut obvious cases ("this is X", "I'm X", being addressed as "Miss
 * X") to skip an LLM call — but every one of those patterns turned out to
 * have real, confirmed-live false positives ("I'm calling" → "calling",
 * "I'm really understaffed" → "really", even "this is unacceptable" would
 * extract "unacceptable"), each accepted at confidence: "high" with
 * nothing downstream positioned to catch it. This is not a fixable-by-
 * more-patterns problem: natural language has unbounded ways to continue
 * a sentence or address someone, so no denylist is ever complete. The
 * task is fundamentally about understanding MEANING, which is exactly
 * what the LLM (with full transcript context, an explicit
 * no-guessing instruction, and the duplicate-name/hallucination
 * safety nets below) is actually suited for — regex was pattern-matching
 * syntax and losing. The LLM call also already has to run for the large
 * majority of real calls anyway (rarely does every speaker cleanly
 * self-introduce), so the regex layer was buying very little cost
 * savings in exchange for this entire bug class.
 */
function buildPrompt(segments: EligibleSegment[], labels: string[]) {
  const system = [
    "You identify speakers in a call transcript by their diarization label (e.g. speaker_1).",
    "For each label listed, infer the speaker's likely real name ONLY if the transcript contains",
    "direct evidence: a self-introduction, being addressed by name, or being named in context",
    '(e.g. "this is X from Y company"). If there is no such evidence, do NOT guess a name —',
    'fall back to a role guess like "Agent", "Customer", or "Caller" instead. Never invent a name',
    "that isn't evidenced in the text.",
    "",
    "Each label you resolve MUST get a DIFFERENT name from every other speaker on this call",
    '(generic role guesses like "Agent" or "Customer" may repeat, real names may not) — a speaker',
    "greeting another speaker by name does not mean the greeter shares that name.",
    "",
    "Return ONLY a JSON array, no prose, no markdown fences, matching this shape exactly:",
    '[{ "label": string, "suggestedName": string, "confidence": "high" | "medium" | "low", "evidence": string }]',
  ].join("\n");

  const userLines = [
    "Transcript:",
    renderTranscriptBlock(segments),
    "",
    "Each label's own first line, for reference (self-introductions are usually here, but check the",
    "full transcript above too — being addressed by name, or named in context, can appear anywhere):",
    firstUtteranceByLabel(segments, labels),
    "",
    `Resolve exactly these labels: ${labels.join(", ")}`,
  ];

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userLines.join("\n") },
  ];
}

function isValidInferredSpeaker(value: unknown): value is InferredSpeaker {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.suggestedName === "string" &&
    typeof candidate.evidence === "string" &&
    (candidate.confidence === "high" || candidate.confidence === "medium" || candidate.confidence === "low")
  );
}

function parseAndValidate(raw: string, allowedLabels: Set<string>): InferredSpeaker[] | null {
  const parsed: unknown = parseJsonLeniently(raw);
  if (parsed === null) return null;

  if (!Array.isArray(parsed)) return null;
  if (!parsed.every(isValidInferredSpeaker)) return null;

  // Reject hallucinated labels not in the input, AND require full
  // coverage of every label we asked about — a response missing a label
  // (or containing a duplicate that shrinks the effective set) must not
  // silently produce an `undefined` entry downstream.
  const labelsInResponse = new Set(parsed.map((item) => item.label));
  if (labelsInResponse.size !== allowedLabels.size) return null;
  for (const label of allowedLabels) {
    if (!labelsInResponse.has(label)) return null;
  }

  // A real name can't legitimately belong to two different diarized
  // speakers on the same call (generic role guesses are exempt — see
  // GENERIC_ROLE_NAMES). Catches the model reusing a name across two
  // labels (e.g. one speaker greets the other by name mid-turn, and the
  // model attributes that name to the wrong speaker).
  const seenNames = new Set<string>();
  for (const item of parsed) {
    const normalized = normalizeName(item.suggestedName);
    if (GENERIC_ROLE_NAMES.has(normalized)) continue;
    if (seenNames.has(normalized)) return null;
    seenNames.add(normalized);
  }

  return parsed;
}

function positionalFallback(labels: string[]): InferredSpeaker[] {
  return labels.map((label, index) => ({
    label,
    suggestedName: `Speaker ${String.fromCharCode(65 + (index % 26))}`,
    confidence: "low" as const,
    evidence: "inference failed, using positional fallback",
  }));
}

/**
 * Infers likely real names for each diarized speaker label in a
 * transcript, entirely via the LLM (see buildPrompt's comment for why
 * there's no regex pre-pass). Never hallucinates a name without evidence
 * — the prompt explicitly instructs a role-guess fallback over guessing,
 * and a double LLM failure degrades to a positional fallback rather than
 * surfacing bad output.
 *
 * jsonMode (response_format: json_object) is deliberately not used —
 * confirmed live elsewhere in this codebase that NVIDIA NIM's enforcement
 * of it degrades to garbage output for a large enough prompt, and this
 * function renders the whole transcript into one prompt. parseJsonLeniently
 * is the safety net for the rarer case of a stray leading token even in
 * plain-text mode.
 */
export async function inferSpeakerNames(transcript: Transcript, client: LLMClient): Promise<InferredSpeaker[]> {
  const eligible = transcript.filter(isEligible);

  // Fully non-diarized/mono transcript, or nothing eligible after
  // filtering out null-speaker and partial segments: nothing to infer,
  // and nothing worth sending to the LLM.
  if (eligible.length === 0) {
    return [];
  }

  const labels = distinctLabelsInOrder(eligible);
  const messages = buildPrompt(eligible, labels);
  const allowedLabels = new Set(labels);

  let raw = await client.complete(messages, { temperature: 0 });
  let resolved = parseAndValidate(raw, allowedLabels);

  if (!resolved) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user" as const,
          content:
            "Return ONLY a JSON array. No prose, no markdown fences, no explanation. " +
            "Every speaker must have a name distinct from every other speaker on this call " +
            "(generic roles like Agent/Customer may repeat, real names may not).",
        },
      ],
      { temperature: 0 },
    );
    resolved = parseAndValidate(raw, allowedLabels);
  }

  const finalResults = resolved ?? positionalFallback(labels);
  const byLabel = new Map(finalResults.map((item) => [item.label, item] as const));
  return labels.map((label) => byLabel.get(label)!);
}
