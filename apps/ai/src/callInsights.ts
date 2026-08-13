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
} from "./types.js";

function renderTranscriptBlock(transcript: NamedTranscript): string {
  return transcript
    .map((segment, index) => `${index + 1}. [${segment.id}] ${segment.speakerName}: ${segment.text}`)
    .join("\n");
}

function buildPrompt(transcript: NamedTranscript) {
  const system = [
    "You analyze a sales/support call transcript (already labeled with real speaker names) and extract",
    "structured insights. Answer exactly these four questions:",
    "- summary: what happened on the call, as a short list of distinct points.",
    "- objections: what objections or concerns came up.",
    "- customerWants: what the customer wants or is asking for.",
    "- nextSteps: what to do next, and who owns each action.",
    "Optionally include followUpEmail: a short draft follow-up email, or null if one isn't warranted.",
    "",
    "Every item MUST be grounded: include at least one evidence entry citing the exact segment id",
    "(the bracketed id in the transcript, e.g. seg_3) and a short quote from that exact segment.",
    "Never cite a segment id that isn't in the transcript. Never invent a claim with no evidence.",
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
          evidence: [{ segmentId: "string", quote: "string" }],
        },
      },
      null,
      2,
    ),
  ].join("\n");

  const user = ["Transcript:", renderTranscriptBlock(transcript)].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function isEvidenceArray(value: unknown): value is Evidence[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).segmentId === "string" &&
        typeof (item as Record<string, unknown>).quote === "string",
    )
  );
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
  return typeof v.subject === "string" && typeof v.body === "string" && isEvidenceArray(v.evidence);
}

function allEvidenceIsGrounded(insights: CallInsights, validSegmentIds: Set<string>): boolean {
  const groups: Evidence[][] = [
    ...insights.summary.map((item) => item.evidence),
    ...insights.objections.map((item) => item.evidence),
    ...insights.customerWants.map((item) => item.evidence),
    ...insights.nextSteps.map((item) => item.evidence),
    insights.followUpEmail ? insights.followUpEmail.evidence : [],
  ];
  return groups.every((evidence) => evidence.every((item) => validSegmentIds.has(item.segmentId)));
}

function parseAndValidate(raw: string, validSegmentIds: Set<string>): CallInsights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const v = parsed as Record<string, unknown>;

  if (!Array.isArray(v.summary) || !v.summary.every(isSummaryItem)) return null;
  if (!Array.isArray(v.objections) || !v.objections.every(isObjection)) return null;
  if (!Array.isArray(v.customerWants) || !v.customerWants.every(isCustomerWant)) return null;
  if (!Array.isArray(v.nextSteps) || !v.nextSteps.every(isNextStep)) return null;
  if (v.followUpEmail !== null && !isFollowUpEmail(v.followUpEmail)) return null;

  const insights = v as unknown as CallInsights;
  if (!allEvidenceIsGrounded(insights, validSegmentIds)) return null;

  return insights;
}

/**
 * Generates call insights (summary, objections, customer wants, next
 * steps, optional follow-up email) from a named transcript — real speaker
 * names, not speaker_1/speaker_2, so run this only after speaker-name
 * inference has already succeeded. Every claim is grounded with evidence
 * citing a real segment id; unlike speaker-name inference there is no
 * safe synthetic fallback for a call summary, so a response that fails
 * validation twice throws rather than surfacing bad output.
 */
export async function generateCallInsights(transcript: NamedTranscript, client: LLMClient): Promise<CallInsights> {
  const validSegmentIds = new Set(transcript.map((segment) => segment.id));
  const messages = buildPrompt(transcript);

  let raw = await client.complete(messages, { jsonMode: true, temperature: 0 });
  let insights = parseAndValidate(raw, validSegmentIds);

  if (!insights) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user" as const,
          content:
            "Return ONLY a JSON object matching the shape above. No prose, no markdown fences, no explanation. " +
            "Every evidence segmentId must be one that appears in the transcript.",
        },
      ],
      { jsonMode: true, temperature: 0 },
    );
    insights = parseAndValidate(raw, validSegmentIds);
  }

  if (!insights) {
    throw new Error("Could not parse a valid CallInsights response from the LLM after one retry");
  }

  return insights;
}
