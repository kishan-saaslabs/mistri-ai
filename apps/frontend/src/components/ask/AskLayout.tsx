import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MorphIn, SkeletonLine } from "@/components/ui/skeleton";
import { ApiError, conversationsApi, type Conversation } from "@/lib/api";
import { chatTitle } from "@/lib/ask";
import { formatDateTime } from "@/lib/display";
import { queryKeys } from "@/lib/query";
import { motionTransition, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/state/auth";

export function AskLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const onOverview = pathname === "/ask";
  const selectedId = pathname.match(/^\/ask\/([^/]+)/)?.[1] ?? null;
  const selectedConversationId =
    selectedId && selectedId !== "new" ? selectedId : null;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDebounced("");
      return;
    }
    const id = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const listQuery = useQuery({
    queryKey: queryKeys.conversations(user?.id ?? ""),
    queryFn: () => conversationsApi.list(),
    enabled: Boolean(user?.id) && !debounced,
  });
  const searchQuery = useQuery({
    queryKey: queryKeys.conversationSearch(user?.id ?? "", debounced),
    queryFn: () => conversationsApi.search(debounced),
    enabled: Boolean(user?.id) && Boolean(debounced),
  });

  const conversations = debounced
    ? (searchQuery.data ?? [])
    : (listQuery.data ?? []);
  const loading = debounced
    ? searchQuery.isPending && !searchQuery.data
    : listQuery.isPending && !listQuery.data;

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "flex h-full w-full shrink-0 flex-col border-r border-border bg-background md:w-[260px]",
          !onOverview && "max-md:hidden",
        )}
      >
        <div className="shrink-0 px-3 pt-4 pb-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <Link to="/ask" className="text-[15px] font-semibold text-foreground">
              Chats
            </Link>
            <Button asChild size="sm" data-icon="inline-start">
              <Link to="/ask/new">
                <Plus className="size-3.5" />
                New
              </Link>
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats…"
              className="h-8 bg-muted/60 pl-8 dark:bg-input/40"
            />
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          loading={loading}
          emptyLabel={
            debounced
              ? `No chats match “${debounced}”`
              : "No chats yet."
          }
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
  loading,
  emptyLabel,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  emptyLabel: string;
}) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pending, setPending] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pending || !user || deleting) return;
    setDeleting(true);
    try {
      await conversationsApi.remove(pending.id);
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations(user.id),
        (prev) => (prev ?? []).filter((c) => c.id !== pending.id),
      );
      queryClient.removeQueries({
        queryKey: queryKeys.conversationMessages(pending.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(user.id),
      });
      if (selectedId === pending.id) void navigate("/ask");
      setPending(null);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not delete that chat.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {loading ? (
        Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="px-2.5 py-2">
            <div className="truncate text-[13px] font-medium">
              <SkeletonLine className="w-[70%]" />
            </div>
            <div className="mt-0.5 text-[11px]">
              <SkeletonLine className="w-[42%]" />
            </div>
          </div>
        ))
      ) : conversations.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">
          {emptyLabel}
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
                  className="group relative"
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={motionTransition(reduce, springs.smooth)}
                >
                  <NavLink
                    to={`/ask/${chat.id}`}
                    className="relative block min-w-0 rounded-lg px-2.5 py-2 pr-8 hover:bg-muted/50"
                  >
                    {selected ? (
                      <motion.span
                        layoutId="ask-list-pill"
                        className="absolute inset-0 rounded-lg bg-brand-tint"
                        transition={motionTransition(reduce, springs.pill)}
                      />
                    ) : null}
                    <div className="relative z-1 min-w-0 truncate text-[13px] font-medium">
                      {chatTitle(chat.title)}
                    </div>
                    <div className="relative z-1 mt-0.5 text-[11px] text-muted-foreground">
                      {formatDateTime(chat.last_activity_at)}
                    </div>
                  </NavLink>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1.5 right-1.5 z-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 max-md:opacity-100"
                    aria-label={`Delete ${chatTitle(chat.title)}`}
                    onClick={() => setPending(chat)}
                  >
                    <Trash2 />
                  </Button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </MorphIn>
      )}

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !deleting && setPending(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This removes “{chatTitle(pending?.title)}” and its messages.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              pending={deleting}
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
