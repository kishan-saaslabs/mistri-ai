import type { AskMessage, CallRecord, Deal, Rep } from "@/types/domain";

export const ASK_SUGGESTIONS = [
  "What's blocking Acme?",
  "What's the latest on Northwind?",
  "Which deal needs a follow-up?",
  "Summarize the Brightline call",
];

export function answerAskQuestion(
  text: string,
  ctx: {
    askContext: string | null;
    calls: Record<string, CallRecord>;
    deals: Record<string, Deal>;
    reps: Record<string, Rep>;
  },
): Omit<Extract<AskMessage, { role: "bot" }>, "role"> {
  const q = text.toLowerCase();
  const { askContext, calls, deals, reps } = ctx;

  if (askContext && calls[askContext]) {
    return { text: "Here's where this call stands:", inlineCard: { type: "deal", key: askContext } };
  }

  const dealId = Object.keys(deals).find((id) => q.includes(deals[id]!.name.toLowerCase()));
  if (dealId) {
    const dealCalls = Object.keys(calls).filter((k) => calls[k]!.dealId === dealId);
    if (dealCalls.length === 0) {
      return {
        text: `No calls on **${deals[dealId]!.name}** yet — open the deal and add a recording.`,
      };
    }
    const latest = dealCalls[dealCalls.length - 1]!;
    return {
      text:
        dealCalls.length === 1
          ? `Here's the call on **${deals[dealId]!.name}**:`
          : `${deals[dealId]!.name} has ${dealCalls.length} calls. Most recent:`,
      inlineCard: { type: "deal", key: latest },
    };
  }

  const mentionedReps = Object.keys(reps).filter(
    (key) => q.includes(reps[key]!.name.split(" ")[0]!.toLowerCase()) || q.includes(key),
  );
  if (mentionedReps.length) {
    const repKey = mentionedReps[0]!;
    const rep = reps[repKey]!;
    const repCalls = Object.keys(calls).filter((k) => calls[k]!.rep === repKey);
    const riskiest = [...repCalls]
      .map((key) => ({ key, call: calls[key]! }))
      .sort((a, b) => (a.call.score ?? 100) - (b.call.score ?? 100))[0];
    return {
      text: `${rep.name}'s calls are averaging a deal health of **${rep.avgHealth ?? "--"}** this month, with **${rep.atRisk}** deal(s) flagged at risk.`,
      inlineCard: { type: "rep", key: repKey },
      secondaryCard: riskiest ? { type: "deal", key: riskiest.key } : undefined,
    };
  }

  if (q.includes("riskiest") || (q.includes("risk") && (q.includes("team") || q.includes("which") || q.includes("who")))) {
    const ranked = Object.keys(calls)
      .map((key) => ({ key, call: calls[key]! }))
      .sort((a, b) => (a.call.score ?? 100) - (b.call.score ?? 100));
    const worst = ranked[0];
    if (!worst) {
      return { text: "There are no calls to score yet." };
    }
    return {
      text: `The riskiest deal right now is owned by ${reps[worst.call.rep]?.name ?? "a rep"}:`,
      inlineCard: { type: "deal", key: worst.key },
    };
  }

  if (q.includes("at risk") || (q.includes("risk") && q.includes("rep"))) {
    const atRiskReps = Object.keys(reps).filter((k) => reps[k]!.atRisk > 0);
    if (atRiskReps.length === 0) {
      return { text: "No reps currently have deals flagged at risk." };
    }
    return { text: "Reps with flagged deals:", multiRepCards: atRiskReps };
  }

  return {
    text: "I can answer questions about a specific call, a rep's pipeline, or which deals need attention — try asking about a rep by name, or which deal is riskiest right now.",
  };
}
