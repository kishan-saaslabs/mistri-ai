#!/usr/bin/env tsx
/**
 * Minimal eval runner (see fixtures.ts and the KB chat plan's "Required
 * immediately after v1 ships" section). Not a CI gate at this scale —
 * run manually before/after any change to chunking, retrieval, or the
 * chat prompt:
 *
 *   pnpm --filter @mistri-ai/api exec tsx src/evals/runEvals.ts
 */
import { CallModel } from "../models/callModel.js";
import { ChatService } from "../services/chatService.js";
import { EVAL_CASES } from "./fixtures.js";

type CaseResult = { name: string; passed: boolean; reasons: string[] };

async function runCase(evalCase: (typeof EVAL_CASES)[number]): Promise<CaseResult> {
  const call = await CallModel.findById(evalCase.callId);
  if (!call) {
    return { name: evalCase.name, passed: false, reasons: [`call ${evalCase.callId} not found`] };
  }
  const actorId = call.uploaded_by;
  if (!actorId) {
    return { name: evalCase.name, passed: false, reasons: [`call ${evalCase.callId} has no uploaded_by actor`] };
  }

  const { conversationId } = await ChatService.createConversation(actorId, {
    scopeType: "call",
    scopeCallId: evalCase.callId,
  });
  const message = await ChatService.postMessage(actorId, conversationId, evalCase.query);

  const reasons: string[] = [];
  const answer = message?.content ?? "";
  const citations = message?.citations ?? [];
  const attributionUncertain = Boolean((message?.context_stats as Record<string, unknown> | null)?.attributionUncertain);

  if (evalCase.expectedSegmentIds) {
    const citedIds = new Set(citations.map((c) => c.segmentId));
    const anyMatch = evalCase.expectedSegmentIds.some((id) => citedIds.has(id));
    if (!anyMatch) {
      reasons.push(
        `expected a citation for one of [${evalCase.expectedSegmentIds.join(", ")}], got [${[...citedIds].join(", ")}]`,
      );
    }
  }

  if (evalCase.expectAnswerContains) {
    const lower = answer.toLowerCase();
    for (const substring of evalCase.expectAnswerContains) {
      if (!lower.includes(substring.toLowerCase())) {
        reasons.push(`expected answer to contain "${substring}", got: ${JSON.stringify(answer)}`);
      }
    }
  }

  if (evalCase.expectNoCitations && citations.length > 0) {
    reasons.push(`expected no citations, got ${citations.length}`);
  }

  if (evalCase.expectAttributionUncertain !== undefined && attributionUncertain !== evalCase.expectAttributionUncertain) {
    reasons.push(`expected attributionUncertain=${evalCase.expectAttributionUncertain}, got ${attributionUncertain}`);
  }

  return { name: evalCase.name, passed: reasons.length === 0, reasons };
}

const results: CaseResult[] = [];
for (const evalCase of EVAL_CASES) {
  const result = await runCase(evalCase);
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.name}`);
  for (const reason of result.reasons) console.log(`        ${reason}`);
}

const passCount = results.filter((r) => r.passed).length;
console.log(`\n${passCount}/${results.length} passed`);
process.exit(passCount === results.length ? 0 : 1);
