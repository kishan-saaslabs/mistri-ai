import type { LLMClient } from "./llm/llmClient.js";
import type {
  CallInsightCustomerWant,
  CallInsightFollowUpEmail,
  CallInsightNextStep,
  CallInsightObjection,
  CallInsightSummaryItem,
  CallInsights,
  Evidence,
  NamedTranscript,
  NamedTranscriptSegment,
} from "./types.js";
import { parseJsonLeniently } from "./util/parseJson.js";

const EMPTY_INSIGHTS: CallInsights = {
  summary: [],
  objections: [],
  customerWants: [],
  nextSteps: [],
  followUpEmail: null,
};

/**
 * Provisional/truncated segments (pyaiHear.ts preserves whatever the
 * provider marked "partial") shouldn't be cited as evidence for the same
 * reason speaker-name inference excludes them — unreliable source text.
 * Filtered once here; everything downstream (the rendered prompt AND the
 * grounding check) operates on this same filtered set, so the model can
 * never end up citing a segment it was never shown.
 */
function finalSegmentsOnly(transcript: NamedTranscript): NamedTranscript {
  return transcript.filter((segment) => segment.type === "final");
}

function normalizeQuoteText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSegmentTextIndex(segments: NamedTranscript): Map<string, string> {
  return new Map(segments.map((segment) => [segment.id, normalizeQuoteText(segment.text)]));
}

function renderTranscriptBlock(segments: NamedTranscript): string {
  return segments
    .map((segment: NamedTranscriptSegment, index) => `${index + 1}. [${segment.id}] ${segment.speakerName}: ${segment.text}`)
    .join("\n");
}

function buildPrompt(segments: NamedTranscript) {
  const system = [
    "You analyze a sales/support call transcript (already labeled with real speaker names) and extract",
    "structured insights. Answer exactly these four questions:",
    "- summary: what happened on the call, as a short list of distinct points.",
    "- objections: what objections or concerns came up.",
    "- customerWants: what the customer wants or is asking for.",
    "- nextSteps: what to do next, and who owns each action.",
    "",
    "Include followUpEmail only when the call ended with something concrete still open — a commitment",
    "either side made, a specific price/date/quantity that was agreed or promised, or something the rep",
    "said they'd send or check on. If so, draft a short (2-4 sentence) email confirming that commitment",
    "in the customer's own terms, and set confidence on how clearly the call actually warranted one.",
    "Use null when the call was purely informational, internal, or ended without anything left open —",
    "mentioning a number in conversation is not by itself a reason to include this field.",
    "",
    "Every item MUST be grounded: include at least one evidence entry citing the exact segment id",
    "(the bracketed id in the transcript, e.g. seg_3) and a short quote copied verbatim from that exact",
    "segment's text — same wording, don't paraphrase or re-punctuate. A quote must come entirely from",
    "the single segment you cite it to — never combine or splice text from two different segments into",
    "one quote, even if they're adjacent and part of the same sentence. Never cite a segment id that",
    "isn't in the transcript. Never invent a claim with no evidence.",
    "",
    "Return ONLY a JSON object, no prose, no markdown fences, matching this shape exactly:",
    JSON.stringify(
      {
        summary: [{ title: "string", text: "string", evidence: [{ segmentId: "string", quote: "string" }] }],
        objections: [{ title: "string", text: "string", evidence: [{ segmentId: "string", quote: "string" }] }],
        customerWants: [
          {
            label: "string",
            confidence: "high | medium | low",
            evidence: [{ segmentId: "string", quote: "string" }],
          },
        ],
        nextSteps: [
          { text: "string", owner: "string", evidence: [{ segmentId: "string", quote: "string" }] },
        ],
        followUpEmail: {
          subject: "string",
          body: "string",
          confidence: "high | medium | low",
          evidence: [{ segmentId: "string", quote: "string" }],
        },
      },
      null,
      2,
    ),
  ].join("\n");

  const user = ["Transcript:", renderTranscriptBlock(segments)].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function isValidEvidenceItem(item: unknown): item is Evidence {
  if (typeof item !== "object" || item === null) return false;
  const v = item as Record<string, unknown>;
  return typeof v.segmentId === "string" && typeof v.quote === "string" && v.quote.trim().length > 0;
}

function isEvidenceArray(value: unknown): value is Evidence[] {
  // Non-empty per the prompt's "at least one evidence entry" requirement
  // — an item with evidence: [] previously passed validation vacuously.
  // A quote that's empty/whitespace-only is the same loophole one level
  // down, so it's rejected here too.
  return Array.isArray(value) && value.length > 0 && value.every(isValidEvidenceItem);
}

// summary and objections both have the { title, text, evidence } shape.
function hasTitleTextEvidence(value: unknown): value is { title: string; text: string; evidence: Evidence[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === "string" && typeof v.text === "string" && isEvidenceArray(v.evidence);
}

const isSummaryItem = (value: unknown): value is CallInsightSummaryItem => hasTitleTextEvidence(value);
const isObjection = (value: unknown): value is CallInsightObjection => hasTitleTextEvidence(value);

function isCustomerWant(value: unknown): value is CallInsightCustomerWant {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    (v.confidence === "high" || v.confidence === "medium" || v.confidence === "low") &&
    isEvidenceArray(v.evidence)
  );
}

function isNextStep(value: unknown): value is CallInsightNextStep {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.text === "string" && typeof v.owner === "string" && isEvidenceArray(v.evidence);
}

function isFollowUpEmail(value: unknown): value is CallInsightFollowUpEmail {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.subject === "string" &&
    typeof v.body === "string" &&
    (v.confidence === "high" || v.confidence === "medium" || v.confidence === "low") &&
    isEvidenceArray(v.evidence)
  );
}

/**
 * Checks every evidence citation across all five sections: the segment id
 * must exist AND the quote must actually appear (case/whitespace-
 * normalized) in that segment's own text — not just that the id is valid.
 * Catches both a hallucinated segment id and a fabricated or cross-segment
 * spliced quote attributed to a real one.
 */
function allEvidenceIsGrounded(insights: CallInsights, segmentTextById: Map<string, string>): boolean {
  const groups: Evidence[][] = [
    ...insights.summary.map((item) => item.evidence),
    ...insights.objections.map((item) => item.evidence),
    ...insights.customerWants.map((item) => item.evidence),
    ...insights.nextSteps.map((item) => item.evidence),
    insights.followUpEmail ? insights.followUpEmail.evidence : [],
  ];
  return groups.every((evidence) =>
    evidence.every((item) => {
      const segmentText = segmentTextById.get(item.segmentId);
      return segmentText !== undefined && segmentText.includes(normalizeQuoteText(item.quote));
    }),
  );
}

function parseAndValidate(raw: string, segmentTextById: Map<string, string>): CallInsights | null {
  const parsed: unknown = parseJsonLeniently(raw);
  if (parsed === null) return null;

  if (typeof parsed !== "object" || parsed === null) return null;
  const v = parsed as Record<string, unknown>;

  if (!Array.isArray(v.summary) || !v.summary.every(isSummaryItem)) return null;
  if (!Array.isArray(v.objections) || !v.objections.every(isObjection)) return null;
  if (!Array.isArray(v.customerWants) || !v.customerWants.every(isCustomerWant)) return null;
  if (!Array.isArray(v.nextSteps) || !v.nextSteps.every(isNextStep)) return null;
  if (v.followUpEmail !== null && !isFollowUpEmail(v.followUpEmail)) return null;

  const insights = v as unknown as CallInsights;
  if (!allEvidenceIsGrounded(insights, segmentTextById)) return null;

  return insights;
}

/**
 * Generates call insights (summary, objections, customer wants, next
 * steps, optional follow-up email) from a named transcript — real speaker
 * names, not speaker_1/speaker_2, so run this only after speaker-name
 * inference has already succeeded.
 *
 * Every claim is grounded: both the cited segment id AND the quote text
 * itself are verified against the transcript (case/whitespace-normalized),
 * so a model can't fabricate or splice a quote onto a real segment id and
 * have it pass. Partial (unfinalized) segments are excluded entirely —
 * never rendered to the model, never a valid citation target. Unlike
 * speaker-name inference there is no safe synthetic fallback for a call
 * summary, so a response that fails validation twice throws rather than
 * surfacing bad output.
 */
export async function generateCallInsights(transcript: NamedTranscript, client: LLMClient): Promise<CallInsights> {
  const eligible = finalSegmentsOnly(transcript);

  // Nothing reliable to reason about — every downstream check would only
  // ever pass vacuously (empty arrays), so skip the LLM call entirely.
  if (eligible.length === 0) {
    return EMPTY_INSIGHTS;
  }

  const segmentTextById = buildSegmentTextIndex(eligible);
  const messages = buildPrompt(eligible);

  let raw = await client.complete(messages, { jsonMode: true, temperature: 0 });
  let insights = parseAndValidate(raw, segmentTextById);

  if (!insights) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user" as const,
          content:
            "Return ONLY a JSON object matching the shape above. No prose, no markdown fences, no explanation. " +
            "Every evidence segmentId must be one that appears in the transcript, and every quote must be the " +
            "exact wording of that single segment — no splicing text from another segment in.",
        },
      ],
      { jsonMode: true, temperature: 0 },
    );
    insights = parseAndValidate(raw, segmentTextById);
  }

  if (!insights) {
    throw new Error("Could not parse a valid CallInsights response from the LLM after one retry");
  }

  return insights;
}
