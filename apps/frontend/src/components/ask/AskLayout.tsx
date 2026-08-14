import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MorphIn } from "@/components/ui/skeleton";
import { type Conversation } from "@/lib/api";
import { formatDateTime } from "@/lib/display";
import { readAskChats } from "@/lib/ask";
import { queryKeys } from "@/lib/query";
import { motionTransition, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/state/auth";

export function AskLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const onOverview = pathname === "/ask";
  const selectedId = pathname.match(/^\/ask\/([^/]+)/)?.[1] ?? null;
  const selectedConversationId =
    selectedId && selectedId !== "new" ? selectedId : null;
  const listQuery = useQuery({
    queryKey: queryKeys.conversations(user?.id ?? ""),
    queryFn: () => readAskChats(user!.id),
    enabled: Boolean(user?.id),
  });
  const conversations = listQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "flex h-full w-full shrink-0 flex-col border-r border-border bg-background md:w-[260px]",
          !onOverview && "max-md:hidden",
        )}
      >
        <div className="shrink-0 border-b border-border px-3 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/ask"
              className="text-[15px] font-semibold text-foreground hover:text-brand"
            >
              Chats
            </Link>
            <Button asChild variant="outline" size="sm" data-icon="inline-start">
              <Link to="/ask/new">
                <Plus className="size-3.5" />
                New chat
              </Link>
            </Button>
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
        />
      </aside>
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          onOverview && "max-md:hidden",
        )}
      >
        <Outlet />
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  selectedId,
}: {
  conversations: Conversation[];
  selectedId: string | null;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {conversations.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
          No chats yet.
        </p>
      ) : (
        <MorphIn>
          <AnimatePresence mode="popLayout" initial={false}>
            {conversations.map((chat) => {
              const selected = selectedId === chat.id;
              return (
                <motion.div
                  key={chat.id}
                  layout
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={motionTransition(reduce, springs.smooth)}
                >
                  <NavLink
                    to={`/ask/${chat.id}`}
                    className="relative block min-w-0 border-b border-border px-3 py-2.5 hover:bg-muted/50"
                  >
                    {selected ? (
                      <motion.span
                        layoutId="ask-list-pill"
                        className="absolute inset-0 border-l-2 border-l-brand bg-brand-tint"
                        transition={motionTransition(reduce, springs.pill)}
                      />
                    ) : null}
                    <div className="relative z-1 min-w-0 truncate text-[13px] font-medium">
                      {chat.title.trim() || "Untitled chat"}
                    </div>
                    <div className="relative z-1 mt-px font-mono text-[10.5px] text-muted-foreground">
                      {formatDateTime(chat.last_activity_at)}
                    </div>
                  </NavLink>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </MorphIn>
      )}
    </div>
  );
}
