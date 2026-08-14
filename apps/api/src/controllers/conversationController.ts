import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { ChatService } from "../services/chatService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const createConversationSchema = z
  .object({
    scopeType: z.enum(["call", "deal", "global"]),
    callId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
  })
  .refine(
    (v) => {
      if (v.scopeType === "call") return !!v.callId;
      if (v.scopeType === "deal") return !!v.dealId;
      return true; // 'global' needs neither — it's every call this user can already see
    },
    { message: "callId is required for scopeType 'call'; dealId is required for scopeType 'deal'" },
  );

const postMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  // 'global'-conversation-only: narrow "everything you have access to" down
  // to a specific set of deals/calls FOR THIS QUESTION — a later message in
  // the same thread with no focus (or a different one) isn't bound by it.
  focusDealIds: z.array(z.string().uuid()).max(50).optional(),
  focusCallIds: z.array(z.string().uuid()).max(50).optional(),
});

function sseWrite(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export const ConversationController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = createConversationSchema.parse(req.body);
    const result = await ChatService.createConversation(actor.id, {
      scopeType: body.scopeType,
      scopeCallId: body.callId,
      scopeDealId: body.dealId,
    });
    res.status(201).json(result);
  }),

  listMessages: asyncHandler(async (req: Request, res: Response) => {
    requireUser(req);
    const messages = await ChatService.listMessages(String(req.params.id));
    res.json({ messages });
  }),

  /**
   * SSE stream for one chat turn. `stage` events map to real pipeline
   * steps. The underlying LLMClient interface (llm/llmClient.ts) returns
   * one complete response rather than a token stream — this repo's chat
   * generation isn't token-by-token streamed from the provider yet, so
   * the `answer` event carries the full text in one write rather than
   * many `token` events. Extending OpenAiCompatibleClient to support
   * provider-side streaming would remove this gap; noted as a follow-up,
   * not something silently faked here.
   */
  postMessage: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = postMessageSchema.parse(req.body);
    const conversationId = String(req.params.id);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      sseWrite(res, "stage", { stage: "authorizing" });
      sseWrite(res, "stage", { stage: "retrieving" });

      const message = await ChatService.postMessage(actor.id, conversationId, body.content, {
        focusDealIds: body.focusDealIds,
        focusCallIds: body.focusCallIds,
      });

      sseWrite(res, "stage", { stage: "generating" });
      sseWrite(res, "answer", { text: message?.content ?? "" });
      for (const citation of message?.citations ?? []) {
        sseWrite(res, "citation", citation);
      }
      if (message?.context_stats?.attributionUncertain) {
        sseWrite(res, "notice", {
          kind: "attribution_uncertain",
          text: "This answer draws on a call where speaker identification was uncertain.",
        });
      }
      sseWrite(res, "done", { messageId: message?.id });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const errMessage = error instanceof Error ? error.message : "Chat generation failed";
      sseWrite(res, "error", { status, message: errMessage });
    } finally {
      res.end();
    }
  }),
};
