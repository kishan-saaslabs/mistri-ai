import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  me: ["auth", "me"] as const,
  deals: ["deals"] as const,
  dealCalls: (dealId: string) => ["deals", dealId, "calls"] as const,
  dealMembers: (dealId: string) => ["deals", dealId, "members"] as const,
  users: ["users"] as const,
  call: (id: string) => ["calls", id] as const,
  callInsights: (callId: string, transcriptionId: string) =>
    ["calls", callId, "insights", transcriptionId] as const,
  calls: ["calls"] as const,
  conversations: (userId: string) => ["conversations", userId] as const,
  conversationMessages: (id: string) => ["conversations", id, "messages"] as const,
};

export function queryErrorMessage(err: unknown) {
  return err instanceof ApiError
    ? err.message
    : "Something went wrong. Please try again.";
}
