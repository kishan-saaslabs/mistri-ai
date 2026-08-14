import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUp, Handshake, Phone, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ASK_SUGGESTIONS, readAskChats, upsertAskChat } from "@/lib/ask";
import {
  ApiError,
  callsApi,
  conversationFromCreate,
  conversationsApi,
  dealsApi,
  type AskAttach,
  type ChatCitation,
  type ChatMessage,
  type ChatNotice,
  type Conversation,
} from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/display";
import { motionTransition, springs } from "@/lib/motion";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";

type AskLocationState = {
  prompt?: string;
  attach?: AskAttach;
};

export function AskView() {
  const { conversationId: conversationIdParam } = useParams();
  const conversationId =
    conversationIdParam && conversationIdParam !== "new"
      ? conversationIdParam
      : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState<AskAttach | null>(null);
  const [busy, setBusy] = useState(false);
  const [localThread, setLocalThread] = useState<ChatMessage[] | null>(null);
  const [picker, setPicker] = useState<"deal" | "call" | null>(null);
  const [filter, setFilter] = useState("");
  const reduce = useReducedMotion();
  const locked = Boolean(conversationId);

  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations(user?.id ?? ""),
    queryFn: () => readAskChats(user!.id),
    enabled: Boolean(user?.id),
  });
  const messagesQuery = useQuery({
    queryKey: queryKeys.conversationMessages(conversationId ?? ""),
    queryFn: () => conversationsApi.messages(conversationId!),
    enabled: Boolean(conversationId),
  });
  const dealsQuery = useQuery({
    queryKey: queryKeys.deals,
    queryFn: dealsApi.list,
    enabled: picker === "deal",
  });
  const callsQuery = useQuery({
    queryKey: queryKeys.calls,
    queryFn: callsApi.list,
    enabled: picker === "call",
  });

  const dealMatches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = dealsQuery.data ?? [];
    if (!q) return rows;
    return rows.filter((deal) => deal.name.toLowerCase().includes(q));
  }, [dealsQuery.data, filter]);

  const callMatches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = callsQuery.data ?? [];
    if (!q) return rows;
    return rows.filter((call) => call.label.toLowerCase().includes(q));
  }, [callsQuery.data, filter]);

  const current = useMemo(
    () =>
      (conversationsQuery.data ?? []).find((c) => c.id === conversationId) ??
      null,
    [conversationsQuery.data, conversationId],
  );

  const chip: AskAttach | null = locked
    ? current
      ? {
          type: current.scope_type,
          id: current.scope_deal_id ?? current.scope_call_id ?? current.id,
          name: current.title.trim() || "Untitled chat",
        }
      : attach
    : attach;

  const messages = conversationId
    ? (messagesQuery.data ?? [])
    : (localThread ?? []);

  useEffect(() => {
    const state = location.state as AskLocationState | null;
    if (!state?.prompt && !state?.attach) return;
    if (state.prompt?.trim()) setDraft(state.prompt.trim());
    if (state.attach && !conversationId) setAttach(state.attach);
    void navigate(location.pathname, { replace: true, state: null });
  }, [conversationId, location.pathname, location.state, navigate]);

  useEffect(() => {
    setLocalThread(null);
  }, [conversationId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [busy, conversationId, localThread, messagesQuery.data]);

  function rememberConversation(row: Conversation) {
    if (!user) return;
    queryClient.setQueryData(
      queryKeys.conversations(user.id),
      upsertAskChat(user.id, row),
    );
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    if (!chip) {
      toast.error("Attach a deal or call to ask.");
      return;
    }
    setBusy(true);
    setDraft("");
    const userMsg = localMessage("user", value);
    if (conversationId) {
      queryClient.setQueryData<ChatMessage[]>(
        queryKeys.conversationMessages(conversationId),
        (prev) => [...(prev ?? []), userMsg],
      );
    } else {
      setLocalThread((prev) => [...(prev ?? []), userMsg]);
    }

    let createdId = conversationId ?? null;
    try {
      if (!createdId) {
        const created = await conversationsApi.create(
          chip.type === "call"
            ? { scopeType: "call", callId: chip.id }
            : { scopeType: "deal", dealId: chip.id },
        );
        createdId = created.conversationId;
        if (!createdId) {
          throw new ApiError(500, "Conversation id is missing.");
        }
        rememberConversation(conversationFromCreate(created, chip));
      } else if (current) {
        rememberConversation(current);
      }
      const result = await conversationsApi.send(createdId, value);
      const assistant: ChatMessage = {
        id: result.messageId ?? crypto.randomUUID(),
        conversation_id: createdId,
        role: "assistant",
        content: result.text,
        citations: result.citations,
        notice: result.notice,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(
        queryKeys.conversationMessages(createdId),
        (prev) => [...(prev ?? [userMsg]), assistant],
      );
      if (!conversationId) {
        void navigate(`/ask/${createdId}`, { replace: true });
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not send that question.",
      );
      setDraft(value);
      if (conversationId) {
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.conversationMessages(conversationId),
          (prev) => (prev ?? []).filter((m) => m.id !== userMsg.id),
        );
      } else {
        setLocalThread((prev) => (prev ?? []).filter((m) => m.id !== userMsg.id));
      }
      if (createdId && !conversationId) {
        void navigate(`/ask/${createdId}`, { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  const loadingThread =
    Boolean(conversationId) && messagesQuery.isPending && messages.length === 0;
  const empty = messages.length === 0 && !busy && !loadingThread;

  return (
    <div className="flex h-full flex-col items-center">
      <div
        ref={scrollRef}
        className="flex w-full flex-1 justify-center overflow-y-auto"
      >
        <div className="w-full max-w-[720px] px-6 pt-6 pb-2">
          <Link
            to="/ask"
            className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground md:hidden"
          >
            <ArrowLeft className="size-3.5" />
            All chats
          </Link>
          {loadingThread ? (
            <ChatPending kind="load" />
          ) : empty ? (
            <div className="pt-[60px] text-center">
              <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-[10px] border border-border bg-muted text-[15px] font-bold text-foreground">
                M
              </div>
              <h2 className="mb-1.5 text-[17px] font-semibold">Ask Mistri</h2>
              <p className="mb-[22px] text-[13px] text-muted-foreground">
                Attach a deal or call, then ask about objections, next steps, or
                what the customer wants.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {ASK_SUGGESTIONS.map((item) => (
                  <motion.button
                    key={item}
                    type="button"
                    className="rounded-[7px] border border-border bg-background px-3.5 py-2 text-left text-[12.5px] text-ink-soft hover:border-brand hover:text-brand"
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    transition={motionTransition(reduce, springs.snappy)}
                    onClick={() => {
                      setDraft(item);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  >
                    {item}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 pt-2 pb-8">
              {messages.map((entry) => {
                const you = entry.role === "user";
                const time = formatTime(entry.created_at) || "—";
                const when = formatDateTime(entry.created_at);
                return (
                  <motion.div
                    key={entry.id}
                    className={cn(
                      "group flex",
                      you ? "justify-end" : "justify-start",
                    )}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionTransition(reduce, springs.gentle)}
                  >
                    {you ? (
                      <div className="flex max-w-[min(75%,32rem)] flex-col items-end gap-1">
                        <div className="rounded-2xl rounded-br-md bg-muted px-3 py-2 text-left text-[13.5px] leading-[1.55] whitespace-pre-wrap">
                          {entry.content}
                        </div>
                        <span
                          className="font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"
                          title={when}
                        >
                          {time}
                        </span>
                      </div>
                    ) : (
                      <div className="flex w-full max-w-[40rem] items-start gap-2.5">
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-bold">
                          M
                        </div>
                        <div className="min-w-0 flex-1">
                          <BotMessage
                            text={entry.content}
                            citations={entry.citations ?? []}
                            notice={entry.notice}
                          />
                          <span
                            className="mt-1.5 block font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"
                            title={when}
                          >
                            {time}
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {busy ? <ChatPending kind="generate" /> : null}
            </div>
          )}
        </div>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-[720px] px-6 pt-3 pb-4"
      >
        <div className="rounded-xl border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          {chip ? (
            <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-[12px]">
                {chip.type === "deal" ? (
                  <Handshake className="size-3" />
                ) : (
                  <Phone className="size-3" />
                )}
                <span className="max-w-[220px] truncate">{chip.name}</span>
                {locked ? null : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove attachment"
                    onClick={() => setAttach(null)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            </div>
          ) : null}
          <textarea
            ref={inputRef}
            id="ask-composer"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Ask anything…"
            className="max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <AttachMenu
                open={picker === "deal"}
                onOpenChange={(open) => {
                  setPicker(open ? "deal" : null);
                  if (!open) setFilter("");
                }}
                disabled={locked}
                icon={Handshake}
                label="Attach deal"
                placeholder="Search deals…"
                filter={filter}
                onFilter={setFilter}
                loading={dealsQuery.isPending}
                emptyLabel={
                  (dealsQuery.data ?? []).length === 0
                    ? "No deals yet"
                    : `No deals match “${filter.trim()}”`
                }
                items={dealMatches.map((deal) => ({
                  id: deal.id,
                  name: deal.name,
                }))}
                onPick={(item) =>
                  setAttach({ type: "deal", id: item.id, name: item.name })
                }
              />
              <AttachMenu
                open={picker === "call"}
                onOpenChange={(open) => {
                  setPicker(open ? "call" : null);
                  if (!open) setFilter("");
                }}
                disabled={locked}
                icon={Phone}
                label="Attach call"
                placeholder="Search calls…"
                filter={filter}
                onFilter={setFilter}
                loading={callsQuery.isPending}
                emptyLabel={
                  (callsQuery.data ?? []).length === 0
                    ? "No calls yet"
                    : `No calls match “${filter.trim()}”`
                }
                items={callMatches.map((call) => ({
                  id: call.id,
                  name: call.label,
                }))}
                onPick={(item) =>
                  setAttach({ type: "call", id: item.id, name: item.name })
                }
              />
            </div>
            <Button
              type="submit"
              size="icon-sm"
              disabled={!draft.trim() || busy}
              className="bg-brand text-white hover:bg-brand-hover"
              aria-label="Ask"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AttachMenu({
  open,
  onOpenChange,
  disabled,
  icon: Icon,
  label,
  placeholder,
  filter,
  onFilter,
  loading,
  emptyLabel,
  items,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  icon: typeof Handshake;
  label: string;
  placeholder: string;
  filter: string;
  onFilter: (value: string) => void;
  loading: boolean;
  emptyLabel: string;
  items: { id: string; name: string }[];
  onPick: (item: { id: string; name: string }) => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          data-icon="inline-start"
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div
          className="sticky top-0 z-1 bg-popover px-1 pb-1"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              placeholder={placeholder}
              className="h-7 pl-8"
            />
          </div>
        </div>
        {loading && items.length === 0 ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : items.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => onPick(item)}>
              <span className="truncate">{item.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function localMessage(
  role: ChatMessage["role"],
  content: string,
  citations: ChatCitation[] = [],
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    conversation_id: "",
    content,
    role,
    citations,
    created_at: new Date().toISOString(),
  };
}

function BotMessage({
  text,
  citations,
  notice,
}: {
  text: string;
  citations: ChatCitation[];
  notice?: ChatNotice | null;
}) {
  const [open, setOpen] = useState<ChatCitation | null>(null);

  return (
    <div>
      <div className="text-[13.5px] leading-[1.65] whitespace-pre-wrap">
        {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
          part.startsWith("**") ? (
            <b key={index} className="text-foreground">
              {part.slice(2, -2)}
            </b>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </div>
      {notice?.text ? (
        <p className="mt-2 text-[12.5px] text-warning">{notice.text}</p>
      ) : null}
      {citations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {citations.map((c, index) => (
            <button
              key={`${c.segmentId}-${index}`}
              type="button"
              className="max-w-full cursor-pointer truncate rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground hover:border-brand hover:text-foreground"
              onClick={() => setOpen(c)}
            >
              {c.segmentId}
            </button>
          ))}
        </div>
      ) : null}
      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="font-mono text-[10.5px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
              Evidence
            </DialogTitle>
            <DialogDescription className="sr-only">
              {open?.quote ?? "Cited transcript"}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <div>
              <p className="mb-1.5 text-[14.5px] leading-relaxed whitespace-pre-wrap">
                {open.quote}
              </p>
              <p className="font-mono text-[10.5px] text-muted-foreground">
                {open.segmentId}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PENDING_WORDS = {
  generate: ["Thinking", "Reading", "Weighing", "Writing"],
  load: ["Loading"],
} as const;

function ChatPending({ kind }: { kind: "generate" | "load" }) {
  const reduce = useReducedMotion();
  const words = PENDING_WORDS[kind];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = window.setInterval(
      () => setI((n) => (n + 1) % words.length),
      2200,
    );
    return () => window.clearInterval(id);
  }, [reduce, words]);

  const word = words[reduce ? 0 : i]!;
  const widest = words.reduce((a, b) => (a.length >= b.length ? a : b));
  const fade = { duration: 0.45, ease: [0.4, 0, 0.2, 1] as const };

  return (
    <div
      className="flex w-full items-center gap-2.5 pt-1"
      role="status"
      aria-label={kind === "generate" ? "Generating" : "Loading"}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-bold">
        M
      </div>
      <span className="flex items-center text-[11.5px] leading-none text-muted-foreground">
        <span className="relative inline-grid">
          <span
            className="invisible col-start-1 row-start-1 whitespace-nowrap"
            aria-hidden
          >
            {widest}
          </span>
          {reduce ? (
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {words[0]}
            </span>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={word}
                className="ask-shimmer col-start-1 row-start-1 whitespace-nowrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              >
                {word}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
        <PendingDots reduce={Boolean(reduce)} />
      </span>
    </div>
  );
}

function PendingDots({ reduce }: { reduce: boolean }) {
  if (reduce) return <span>…</span>;
  return (
    <span className="ml-px inline-flex h-[1em] items-end" aria-hidden>
      {[0, 1, 2].map((n) => (
        <motion.span
          key={n}
          className="inline-block"
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 0.7,
            repeat: Infinity,
            delay: n * 0.14,
            ease: "easeInOut",
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}
