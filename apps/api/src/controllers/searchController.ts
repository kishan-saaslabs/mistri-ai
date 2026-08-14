import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { RetrievalService } from "../services/retrievalService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  scopeType: z.enum(["call", "deal", "global"]),
  callId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

export const SearchController = {
  /**
   * Direct hybrid-search endpoint, independent of chat — lets retrieval
   * quality be verified/tested without going through contextualization,
   * generation, or the evidence gate.
   */
  search: asyncHandler(async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const body = searchSchema.parse(req.body);

    const scope = await RetrievalService.resolveChatScope(actor.id, {
      scopeType: body.scopeType,
      scopeCallId: body.callId,
      scopeDealId: body.dealId,
    });

    if (scope.transcriptionIds.length === 0) {
      res.json({ results: [], trace: { route: "SEMANTIC", scopeDescription: scope.scopeDescription, effectiveTranscripts: 0 } });
      return;
    }

    const { route } = RetrievalService.route(body.query, body.scopeType);
    const hits = await RetrievalService.hybridSearch(scope.transcriptionIds, body.query);
    const blocks = await RetrievalService.expandBoundedBlocks(hits);

    res.json({
      results: blocks.map((b, i) => ({
        rank: i + 1,
        chunkId: b.chunkId,
        callId: b.callId,
        transcriptionId: b.transcriptionId,
        segmentIds: b.segmentIds,
        text: b.shownText,
        attributionUncertain: b.attributionUncertain,
      })),
      trace: {
        route,
        scopeDescription: scope.scopeDescription,
        effectiveTranscripts: scope.transcriptionIds.length,
      },
    });
  }),
};
