import type { ChatMessage, LLMClient } from "../llm/llmClient.js";
import { parseJsonLeniently } from "../util/parseJson.js";

export type DealBlock = { dealId: string; dealName: string; text: string };

export type DealCitation = { dealName: string; quote: string };

export type DealSynthesisAnswer = { answer: string; citations: DealCitation[] };

export type DealSynthesisInput = {
  question: string;
  deals: DealBlock[];
};

/**
 * Cross-call/cross-deal reasoning ("which deal needs attention", "score for
 * X", "will any deals churn") — deliberately a SEPARATE prompt from
 * generateChatAnswer rather than reusing it with extra instructions bolted
 * on, since the correctness bar here is different in kind: this synthesizes
 * a judgment (risk, priority) rather than quoting an answer to a factual
 * question, and it's exactly the kind of judgment an LLM will confidently
 * fabricate a fake-precise number or timeframe for if not explicitly told
 * not to — "how many will churn NEXT WEEK" has no date/timeline signal
 * anywhere in this data, and a made-up answer would be actively worse than
 * an honest "can't tell from this data."
 */
function buildDealSynthesisPrompt(input: DealSynthesisInput): ChatMessage[] {
  const system = [
    "You assess deal health/risk using ONLY the per-deal call summaries, objections, and next-steps provided",
    "below. Base any risk or priority judgment ONLY on these two factors, since they're the only ones this",
    "data can actually support: (1) objections recorded with no next step or later call that addresses them",
    "— an unresolved objection is a real risk signal; (2) calls with no next steps recorded at all — a stalled",
    "deal with no clear forward motion. Do not use any other basis (tone, guesswork, deal name, company size).",
    "",
    "NEVER invent a specific date, timeframe (e.g. \"next week\", \"in 3 days\"), dollar amount, or probability",
    "that isn't explicitly present in the evidence below — this data has no dates, subscription terms, or churn",
    "labels in it at all, so any such claim would be fabricated, not derived. If asked for a numeric score, use",
    "a plain qualitative scale (Low / Medium / High risk) grounded in the count of unresolved objections and",
    "missing next-steps you can literally point to — never a fake-precise number like \"7.3/10\", which implies",
    "a precision this data doesn't have.",
    "",
    "If a deal has no calls with insights yet, or the evidence is genuinely too thin to judge, say so explicitly",
    "rather than guessing — \"not enough data yet\" is a correct answer, a confident guess is not.",
    "",
    "Every specific claim (an objection, a missing next step, a risk judgment) MUST cite the deal it came from",
    "by name, with a short VERBATIM quote from that deal's block below — same wording, don't paraphrase. Never",
    "cite a deal that isn't listed below.",
    "",
    "The \"answer\" text is for a human to read — refer to deals and calls only by their real name (never an",
    "internal id). An identifier belongs ONLY inside a citations[] entry, never inside the answer prose itself.",
    "",
    "Return ONLY a JSON object, no prose, no markdown fences, matching this shape exactly:",
    JSON.stringify({ answer: "string", citations: [{ dealName: "string", quote: "string" }] }, null, 2),
  ].join("\n");

  const userParts = [
    "Deals:",
    input.deals.map((d) => `[deal="${d.dealName}"]\n${d.text}`).join("\n\n") || "(no deals accessible)",
    "",
    `Question: ${input.question}`,
  ];

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

function isValidCitation(v: unknown): v is DealCitation {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.dealName === "string" && typeof c.quote === "string" && c.quote.trim().length > 0;
}

function parseShape(raw: string): DealSynthesisAnswer | null {
  const parsed = parseJsonLeniently(raw);
  if (typeof parsed !== "object" || parsed === null) return null;
  const v = parsed as Record<string, unknown>;
  if (typeof v.answer !== "string") return null;
  if (!Array.isArray(v.citations) || !v.citations.every(isValidCitation)) return null;
  return { answer: v.answer, citations: v.citations };
}

export async function generateDealSynthesisAnswer(
  input: DealSynthesisInput,
  client: LLMClient,
): Promise<DealSynthesisAnswer> {
  const messages = buildDealSynthesisPrompt(input);

  let raw = await client.complete(messages, { temperature: 0 });
  let answer = parseShape(raw);

  if (!answer) {
    raw = await client.complete(
      [
        ...messages,
        { role: "user", content: "Return ONLY a JSON object matching the shape above. No prose, no markdown fences." },
      ],
      { temperature: 0 },
    );
    answer = parseShape(raw);
  }

  return (
    answer ?? {
      answer: "I wasn't able to produce a well-formed, grounded assessment — could you rephrase the question?",
      citations: [],
    }
  );
}

/** Same discipline as validateCitations.ts, adapted for deal-name-keyed
 * blocks instead of chunkId/segmentId — quote must be an exact (normalized)
 * substring of the exact text shown for that deal. */
export function validateDealCitations(
  citations: DealCitation[],
  dealTextByName: Map<string, string>,
): { validCitations: DealCitation[]; droppedCount: number } {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  const validCitations: DealCitation[] = [];
  let droppedCount = 0;
  for (const citation of citations) {
    const text = dealTextByName.get(citation.dealName);
    if (!text || !normalize(text).includes(normalize(citation.quote))) {
      droppedCount += 1;
      continue;
    }
    validCitations.push(citation);
  }
  return { validCitations, droppedCount };
}
