import type { LLMClient } from "./llm/llmClient.js";
import type { InferredSpeaker, Transcript, TranscriptSegment } from "./types.js";

const SELF_INTRO_PATTERNS = [/this is (\w+)/i, /(\w+) here\b/i, /i'?m (\w+)/i];

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

function buildPrompt(segments: EligibleSegment[], unresolvedLabels: string[]) {
  const system = [
    "You identify speakers in a call transcript by their diarization label (e.g. speaker_1).",
    "For each label listed, infer the speaker's likely real name ONLY if the transcript contains",
    "direct evidence: a self-introduction, being addressed by name, or being named in context",
    '(e.g. "this is X from Y company"). If there is no such evidence, do NOT guess a name —',
    'fall back to a role guess like "Agent", "Customer", or "Caller" instead. Never invent a name',
    "that isn't evidenced in the text.",
    "",
    'Return ONLY a JSON array, no prose, no markdown fences, matching this shape exactly:',
    '[{ "label": string, "suggestedName": string, "confidence": "high" | "medium" | "low", "evidence": string }]',
  ].join("\n");

  const user = [
    "Transcript:",
    renderTranscriptBlock(segments),
    "",
    `Resolve exactly these labels: ${unresolvedLabels.join(", ")}`,
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
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

  const messages = buildPrompt(eligible, unresolvedLabels);
  const allowedLabels = new Set(unresolvedLabels);

  let raw = await client.complete(messages, { jsonMode: true, temperature: 0 });
  let llmResolved = parseAndValidate(raw, allowedLabels);

  if (!llmResolved) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user" as const,
          content: "Return ONLY a JSON array. No prose, no markdown fences, no explanation.",
        },
      ],
      { jsonMode: true, temperature: 0 },
    );
    llmResolved = parseAndValidate(raw, allowedLabels);
  }

  const finalLlmResults = llmResolved ?? positionalFallback(unresolvedLabels);

  const byLabel = new Map<string, InferredSpeaker>([...resolvedByRegex, ...finalLlmResults.map((item) => [item.label, item] as const)]);

  return labels.map((label) => byLabel.get(label)!);
}
