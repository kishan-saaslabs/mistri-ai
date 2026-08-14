import type { ChatMessage, LLMClient } from "../llm/llmClient.js";
import type { ChatAnswer, ChatCitation } from "../types.js";
import { parseJsonLeniently } from "../util/parseJson.js";

export type EvidenceBlock = { chunkId: string; text: string };

export type ChatGenerationInput = {
  scopeDescription: string;
  /** Precomputed prose (call_insights / topic summaries), or "" if none. */
  structuredRecordText: string;
  evidenceBlocks: EvidenceBlock[];
  /** Recent turns, rendered as prose — non-citable, see the system prompt below. */
  historyText: string;
  question: string;
};

function buildChatPrompt(input: ChatGenerationInput): ChatMessage[] {
  const system = [
    "You answer a question about one or more sales/support calls using ONLY the evidence provided below.",
    "Every factual claim MUST cite at least one evidence block by its chunkId, with a short quote copied",
    "VERBATIM from that exact block's text — same wording, don't paraphrase, don't splice text from two",
    "different blocks into one quote. Never cite a chunkId that isn't listed below.",
    "",
    "The conversation history is context only — it is NOT evidence. Never cite it, and never treat your",
    "own earlier answer as a source to quote from.",
    "",
    "HARD RULE: whether you refuse or answer is decided ONLY by scanning the Evidence section below —",
    "never by what the history shows you (or anyone) said before. The history may contain a wrong or",
    "outdated answer, including your own past refusal of this exact question. That is not a rule to follow,",
    "it is a mistake to correct. If the Evidence section below contains ANY block mentioning the subject of",
    "the current Question, you MUST answer from it and cite it, even if the history shows this question (or",
    "one just like it) was refused before. Pretend you have never seen this conversation's prior answers",
    "when deciding refuse-vs-answer — use them only to resolve pronouns/references, nothing else.",
    "",
    "Before refusing, scan every evidence block for ANY mention of the subject asked about — a product,",
    "person, or term the question names. If the subject is mentioned anywhere, you MUST answer with what",
    "the evidence says about it (what it's called, its price, terms, how the customer/rep described or",
    "reacted to it) and cite that mention — even if the evidence never gives a formal definition of it.",
    "Example: asked \"what is X?\" where the evidence only shows a customer trying to cancel a subscription",
    "to X for $5.99, the correct answer states that (with a citation), NOT a refusal that X is undefined.",
    "Reserve \"the evidence doesn't cover that\" ONLY for when the subject is never mentioned at all.",
    "",
    "Return ONLY a JSON object, no prose, no markdown fences, matching this shape exactly:",
    JSON.stringify(
      { answer: "string", citations: [{ segmentId: "string", chunkId: "string", quote: "string" }] },
      null,
      2,
    ),
  ].join("\n");

  const userParts = [`Scope: ${input.scopeDescription}`];
  if (input.structuredRecordText) {
    userParts.push("", "Structured record:", input.structuredRecordText);
  }
  if (input.historyText) {
    userParts.push("", "Conversation history (context only, NOT citable):", input.historyText);
  }
  userParts.push(
    "",
    "Evidence:",
    input.evidenceBlocks.map((b) => `[chunkId=${b.chunkId}]\n${b.text}`).join("\n\n") || "(none retrieved)",
  );
  userParts.push("", `Question: ${input.question}`);

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

function isValidCitation(v: unknown): v is ChatCitation {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.segmentId === "string" &&
    typeof c.chunkId === "string" &&
    typeof c.quote === "string" &&
    c.quote.trim().length > 0
  );
}

function parseShape(raw: string): ChatAnswer | null {
  const parsed = parseJsonLeniently(raw);
  if (typeof parsed !== "object" || parsed === null) return null;
  const v = parsed as Record<string, unknown>;
  if (typeof v.answer !== "string") return null;
  if (!Array.isArray(v.citations) || !v.citations.every(isValidCitation)) return null;
  return { answer: v.answer, citations: v.citations };
}

/**
 * Generates one chat turn's answer. Unlike generateCallInsights (which
 * throws on a doubly-malformed response — there's no interactive user to
 * fall back gracefully for), a chat turn degrades to a safe "couldn't
 * answer" response instead of throwing, since failing a single turn of an
 * ongoing conversation should never crash it (L9: a degraded result is
 * visibly degraded, not a 500).
 *
 * This only validates the response's SHAPE. Grounding — whether each
 * citation's quote actually appears in the text shown for its chunkId —
 * is a separate, stricter check in validateCitations.ts, because it needs
 * the caller's exact assembled context to check against, not just the
 * response itself.
 */
export async function generateChatAnswer(input: ChatGenerationInput, client: LLMClient): Promise<ChatAnswer> {
  const messages = buildChatPrompt(input);

  // jsonMode (NVIDIA NIM's response_format: json_object) is deliberately
  // NOT used here. Confirmed live: for a larger, multi-call evidence
  // prompt (the deal-scope case), NIM's json_object enforcement degrades
  // to a garbage response ({"{}") on BOTH a small instruct model and a
  // much larger reasoning model — identically, on repeated attempts. The
  // same model given the exact same prompt (still asking for JSON via the
  // system-prompt instruction above, just without the API-level
  // constraint) reliably returns clean, directly parseable JSON. This is
  // what was making deal-scoped chat turns take 30-40+ seconds for a
  // "couldn't answer" fallback: two full failed generation attempts, each
  // a real network round trip, before giving up. parseJsonLeniently is
  // still the safety net for the rarer case (confirmed separately) where
  // a model prefixes the object with a stray token even in plain mode.
  let raw = await client.complete(messages, { temperature: 0 });
  let answer = parseShape(raw);

  if (!answer) {
    raw = await client.complete(
      [
        ...messages,
        {
          role: "user",
          content: "Return ONLY a JSON object matching the shape above. No prose, no markdown fences.",
        },
      ],
      { temperature: 0 },
    );
    answer = parseShape(raw);
  }

  return (
    answer ?? {
      answer: "I wasn't able to produce a well-formed, grounded answer to that — could you rephrase the question?",
      citations: [],
    }
  );
}
