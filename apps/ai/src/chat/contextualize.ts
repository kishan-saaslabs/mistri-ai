import type { ChatMessage, LLMClient } from "../llm/llmClient.js";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ContextualizeResult = {
  standaloneQuery: string;
  isFollowup: boolean;
};

// Deictics/ordinals/pronouns that signal a message depends on prior turns
// to mean anything ("the second one", "how serious is it").
const GENERIC_DEPENDENCE_WORDS = /\b(it|they|them|he|she|him|her|the (first|second|third|last|next) one)\b/i;

// "this"/"that"/"these"/"those" are only a dependence signal when they
// AREN'T immediately naming the fixed chat scope itself. "this call" /
// "that deal" are self-contained — they refer to the conversation's own
// scope, resolvable with zero history — not to something raised earlier
// in the chat. Without this exclusion, "can you summarize this call?"
// gets flagged as needing a rewrite, and — confirmed live — the rewrite
// model can then hijack it into a completely different question re-asking
// whatever the previous turn was about, silently changing what the user
// asked instead of just resolving a reference.
const DEICTIC_NOT_SCOPE_SELF_REFERENCE = /\b(this|that|these|those)\b(?!\s+(call|calls|deal|deals))/i;

function hasDependenceSignal(message: string): boolean {
  return GENERIC_DEPENDENCE_WORDS.test(message) || DEICTIC_NOT_SCOPE_SELF_REFERENCE.test(message);
}

// A capitalized word not already present (case-insensitively) in the
// history or the original message — used to reject a rewrite that
// invents an entity nobody mentioned. Deliberately crude (real NER would
// be its own model call) but catches the failure mode that matters: the
// rewrite naming a company/person absent from the conversation.
function introducesNewEntity(rewritten: string, allowedText: string): boolean {
  const candidates = rewritten.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [];
  const allowedLower = allowedText.toLowerCase();
  return candidates.some((word, i) => {
    if (i === 0) return false; // sentence-initial capitalization isn't an entity signal
    return !allowedLower.includes(word.toLowerCase());
  });
}

/**
 * Rewrites an elliptical follow-up into a standalone query before any
 * retrieval happens (§8.2 of the source spec) — "how serious is the
 * second one?" embeds to nothing useful on its own. Skips the LLM call
 * entirely when the message has no dependence signal (pronoun/ordinal/
 * deictic), since most turns don't need rewriting regardless of length.
 */
export async function contextualizeQuery(
  history: ChatTurn[],
  message: string,
  client: LLMClient,
): Promise<ContextualizeResult> {
  if (history.length === 0) {
    return { standaloneQuery: message, isFollowup: false };
  }

  // No length threshold here anymore — a word-count gate was tried twice
  // (originally >6, then lowered to >3) and broke again both times on
  // short, fully self-contained messages that just happen to be brief:
  // "Can you summarize this call?" (5 words) and "About Land CCK" (3
  // words) both got force-routed into an LLM rewrite purely for being
  // "too short," and the rewrite then hijacked them using unrelated prior
  // history — confirmed live, "About Land CCK" (no dependence signal) came
  // back empty because the rewrite merged in the previous turn's unrelated
  // topic, while "Tell me About Land CCK" (no dependence signal either,
  // just 2 words longer) skipped the rewrite and worked. Length was never
  // the real signal; whether the message actually contains a pronoun/
  // ordinal/deictic dependence marker is. A message with none of those
  // doesn't need history to mean something, regardless of how short it is.
  if (!hasDependenceSignal(message)) {
    return { standaloneQuery: message, isFollowup: false };
  }

  const recentHistory = history.slice(-6);
  const historyText = recentHistory.map((t) => `${t.role}: ${t.content}`).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Rewrite the user's latest message into a standalone question, using the conversation history",
        "only to resolve pronouns/ordinals/references. Do not introduce any named entity (person, company,",
        "deal) that isn't already present in the history or the latest message. Return ONLY the rewritten",
        "question — no prose, no quotes, no explanation.",
      ].join("\n"),
    },
    { role: "user", content: `History:\n${historyText}\n\nLatest message: ${message}` },
  ];

  const raw = await client.complete(messages, { temperature: 0 });
  const rewritten = raw.trim().replace(/^["']|["']$/g, "");

  if (rewritten.length === 0 || introducesNewEntity(rewritten, `${historyText} ${message}`)) {
    // Reject and fall back to the original message rather than retrieve
    // confidently against a hallucinated entity.
    return { standaloneQuery: message, isFollowup: true };
  }

  return { standaloneQuery: rewritten, isFollowup: true };
}
