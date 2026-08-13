import type { LLMClient } from "./llm/llmClient.js";
import type { InferredSpeaker, Transcript, TranscriptSegment } from "./types.js";

const SELF_INTRO_PATTERNS = [/this is (\w+)/i, /(\w+) here\b/i, /i'?m (\w+)/i];

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
 * never finalized). Feeding either into the regex pass or the LLM risks a
 * wrong or garbled name carrying the same confidence as a clean segment,
 * so both are excluded from the inference input entirely.
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

function regexResolve(segments: EligibleSegment[], labels: string[]): Map<string, InferredSpeaker> {
  const resolved = new Map<string, InferredSpeaker>();
  for (const label of labels) {
    for (const segment of segments) {
      if (segment.speaker !== label) continue;
      const match = SELF_INTRO_PATTERNS.map((pattern) => segment.text.match(pattern)).find(Boolean);
      if (match?.[1]) {
        resolved.set(label, {
          label,
          suggestedName: match[1],
          confidence: "high",
          evidence: segment.text.trim().slice(0, 200),
        });
        break;
      }
    }
  }
  return resolved;
}

function renderTranscriptBlock(segments: EligibleSegment[]): string {
  return segments.map((segment, index) => `${index + 1}. [${segment.speaker}] ${segment.text}`).join("\n");
}

function buildPrompt(segments: EligibleSegment[], unresolvedLabels: string[], alreadyResolved: Map<string, InferredSpeaker>) {
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
    'Return ONLY a JSON array, no prose, no markdown fences, matching this shape exactly:',
    '[{ "label": string, "suggestedName": string, "confidence": "high" | "medium" | "low", "evidence": string }]',
  ].join("\n");

  const userLines = ["Transcript:", renderTranscriptBlock(segments)];

  if (alreadyResolved.size > 0) {
    const taken = [...alreadyResolved.values()]
      .map((item) => `${item.label} = ${item.suggestedName}`)
      .join(", ");
    userLines.push(
      "",
      `Already identified (do not reuse these names for anyone else): ${taken}`,
    );
  }

  userLines.push("", `Resolve exactly these labels: ${unresolvedLabels.join(", ")}`);

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

function parseAndValidate(raw: string, allowedLabels: Set<string>, takenNames: Set<string>): InferredSpeaker[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

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
  // GENERIC_ROLE_NAMES). Catches the model reusing an already-resolved
  // name (e.g. one speaker greets the other by name mid-turn, and the
  // model attributes that name to the wrong speaker) as well as assigning
  // the same name to two labels within this same response.
  const seenNames = new Set(takenNames);
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
 * transcript. Never hallucinates a name without evidence — the LLM prompt
 * explicitly instructs a role-guess fallback over guessing, and a
 * double LLM failure degrades to a positional fallback rather than
 * surfacing bad output.
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
  const resolvedByRegex = regexResolve(eligible, labels);
  const unresolvedLabels = labels.filter((label) => !resolvedByRegex.has(label));

  if (unresolvedLabels.length === 0) {
    return labels.map((label) => resolvedByRegex.get(label)!);
  }

  const messages = buildPrompt(eligible, unresolvedLabels, resolvedByRegex);
  const allowedLabels = new Set(unresolvedLabels);
  const takenNames = new Set(
    [...resolvedByRegex.values()]
      .map((item) => normalizeName(item.suggestedName))
      .filter((name) => !GENERIC_ROLE_NAMES.has(name)),
  );

  let raw = await client.complete(messages, { jsonMode: true, temperature: 0 });
  let llmResolved = parseAndValidate(raw, allowedLabels, takenNames);

  if (!llmResolved) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user" as const,
          content:
            "Return ONLY a JSON array. No prose, no markdown fences, no explanation. " +
            "Every speaker must have a name distinct from every other speaker already identified " +
            "on this call (generic roles like Agent/Customer may repeat, real names may not).",
        },
      ],
      { jsonMode: true, temperature: 0 },
    );
    llmResolved = parseAndValidate(raw, allowedLabels, takenNames);
  }

  const finalLlmResults = llmResolved ?? positionalFallback(unresolvedLabels);

  const byLabel = new Map<string, InferredSpeaker>([...resolvedByRegex, ...finalLlmResults.map((item) => [item.label, item] as const)]);

  return labels.map((label) => byLabel.get(label)!);
}
