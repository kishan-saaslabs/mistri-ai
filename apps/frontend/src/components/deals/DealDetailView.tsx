import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AddCallDialog } from "@/components/deals/AddCallDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration } from "@/lib/format";
import {
  ApiError,
  callsApi,
  dealsApi,
  isPendingStatus,
  usersApi,
  type AuthUser,
  type Call,
  type CallStatus,
  type Deal,
} from "@/lib/api";
import { formatDate, initialsOf, roleLabel } from "@/lib/display";
import { useAsyncData } from "@/lib/useAsyncData";
import { cn } from "@/lib/utils";

const POLL_MS = 5_000;

const STATUS_STYLES: Record<
  CallStatus,
  { dot: string; label: string; row?: string; text?: string }
> = {
  PROCESSING: {
    dot: "animate-pulse bg-warning",
    label: "Processing",
    row: "bg-warning-tint/70",
    text: "text-warning",
  },
  PYAI_TRANSCRIBING: {
    dot: "animate-pulse bg-warning",
    label: "Transcribing",
    row: "bg-warning-tint/70",
    text: "text-warning",
  },
  PYAI_SUCCESS: { dot: "bg-success", label: "Ready" },
  PYAI_FAILED: { dot: "bg-danger", label: "Failed" },
  LLM_TRANSCRIBING: {
    dot: "animate-pulse bg-warning",
    label: "Analyzing",
    row: "bg-warning-tint/40",
    text: "text-warning",
  },
  LLM_SUCCESS: { dot: "bg-success", label: "Ready" },
  LLM_FAILED: { dot: "bg-danger", label: "Failed" },
};

/** Fetch a deal's calls and keep pending ones fresh via polling. */
function useDealCalls(dealId: string) {
  const { data, loading, error, refetch } = useAsyncData<Call[]>(
    () => dealsApi.calls(dealId),
    [dealId],
  );
  const [overrides, setOverrides] = useState<Record<string, Call>>({});

  const calls = (data ?? []).map((call) => overrides[call.id] ?? call);
  const pendingKey = calls
    .filter((call) => isPendingStatus(call.status))
    .map((call) => call.id)
    .sort()
    .join(",");

  useEffect(() => {
    setOverrides({});
  }, [dealId]);

  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(",");
    let active = true;
    const timer = window.setInterval(() => {
      void Promise.allSettled(ids.map((id) => callsApi.get(id))).then(
        (results) => {
          if (!active) return;
          setOverrides((prev) => {
            const next = { ...prev };
            for (const result of results) {
              if (result.status === "fulfilled") {
                next[result.value.call.id] = result.value.call;
              }
            }
            return next;
          });
        },
      );
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pendingKey]);

  const reset = () => setOverrides({});
  return { calls, loading, error, refetch, reset };
}

export function DealDetailView() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState("calls");
  const [addOpen, setAddOpen] = useState(false);

  const dealState = useAsyncData<Deal | null>(
    () => dealsApi.list().then((deals) => deals.find((d) => d.id === id) ?? null),
    [id],
  );
  const callsState = useDealCalls(id);
  const membersState = useAsyncData<AuthUser[]>(
    () => dealsApi.members(id),
    [id],
  );

  if (dealState.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dealState.error || !dealState.data) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] text-center">
        <p className="mb-3 text-[13.5px] text-muted-foreground">
          {dealState.error ?? "This deal could not be found."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/deals">Back to deals</Link>
        </Button>
      </div>
    );
  }

  const deal = dealState.data;
  const members = membersState.data ?? [];
  const callCount = callsState.calls.length;

  return (
    <div className="mx-auto w-full max-w-[900px] overflow-y-auto px-7 pt-8 pb-[60px]">
      <Link
        to="/deals"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All deals
      </Link>

      {/* Header + stat strip */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">
            {deal.name}
          </h1>
          <div className="mt-2.5 flex gap-7">
            <Stat
              label="Calls"
              value={callsState.loading ? undefined : callCount}
            />
            <Stat
              label="Members"
              value={membersState.loading ? undefined : members.length}
            />
            <Stat label="Created" text={formatDate(deal.created_at)} />
          </div>
        </div>
        {tab === "calls" && (
          <Button
            type="button"
            data-icon="inline-start"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            Add call
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="calls">
            Calls
            {!callsState.loading && <TabCount>{callCount}</TabCount>}
          </TabsTrigger>
          <TabsTrigger value="settings">
            Settings
            {!membersState.loading && <TabCount>{members.length}</TabCount>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="pt-5">
          <CallsTab
            calls={callsState.calls}
            loading={callsState.loading}
            error={callsState.error}
            refetch={callsState.refetch}
            members={members}
            membersLoading={membersState.loading}
            onAddCall={() => setAddOpen(true)}
            onManageMembers={() => setTab("settings")}
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-5">
          <SettingsTab dealId={id} membersState={membersState} />
        </TabsContent>
      </Tabs>

      <AddCallDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        dealId={id}
        onAdded={() => {
          callsState.reset();
          callsState.refetch();
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  text,
}: {
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[16px] font-semibold tabular-nums">
        {text ?? (value === undefined ? "–" : value)}
      </span>
      <span className="mt-0.5 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

function TabCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-ink-soft">
      {children}
    </span>
  );
}

function CallsTab({
  calls,
  loading,
  error,
  refetch,
  members,
  membersLoading,
  onAddCall,
  onManageMembers,
}: {
  calls: Call[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  members: AuthUser[];
  membersLoading: boolean;
  onAddCall: () => void;
  onManageMembers: () => void;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_248px]">
      {/* Calls list */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="mb-3 text-[13px] text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={refetch}>
              Try again
            </Button>
          </div>
        ) : calls.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-[13.5px] font-medium">No calls in this deal yet</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] text-muted-foreground">
              Upload a recording or paste a link and it’ll be mapped to this
              deal.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4"
              data-icon="inline-start"
              onClick={onAddCall}
            >
              <Plus className="size-3.5" />
              Add call
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {calls.map((call, i) => {
              const status = STATUS_STYLES[call.status];
              return (
                <Link
                  key={call.id}
                  to={`/calls/${call.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-muted/60",
                    i !== calls.length - 1 && "border-b border-border",
                    status.row,
                  )}
                >
                  <span
                    className={cn(
                      "size-[7px] shrink-0 rounded-full",
                      status.dot,
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {call.label}
                    </div>
                    <div
                      className={cn(
                        "mt-px font-mono text-[10.5px]",
                        status.text ?? "text-muted-foreground",
                      )}
                    >
                      {status.label} · {formatDuration(call.duration_seconds)} ·{" "}
                      {formatDate(call.created_at)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Right rail — members preview + quick action */}
      <aside className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-mono text-[10px] tracking-[0.09em] text-muted-foreground uppercase">
            Members
          </h4>
          {!membersLoading && (
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {members.length}
            </span>
          )}
        </div>

        {membersLoading ? (
          <div className="flex items-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No members yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {members.slice(0, 6).map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-border bg-muted font-mono text-[9px] text-ink-soft">
                  {initialsOf(member.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                  {member.name}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                  {roleLabel(member.role)}
                </span>
              </div>
            ))}
            {members.length > 6 && (
              <span className="text-[11px] text-muted-foreground">
                +{members.length - 6} more
              </span>
            )}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          data-icon="inline-start"
          className="mt-4 w-full"
          onClick={onManageMembers}
        >
          <UserPlus className="size-3.5" />
          Add member
        </Button>
      </aside>
    </div>
  );
}

function SettingsTab({
  dealId,
  membersState,
}: {
  dealId: string;
  membersState: {
    data: AuthUser[] | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
  };
}) {
  const orgState = useAsyncData<AuthUser[]>(() => usersApi.list(), []);

  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);

  const members = membersState.data ?? [];
  const orgUsers = orgState.data ?? [];

  const memberIds = new Set(members.map((m) => m.id));
  const available = orgUsers.filter((u) => !memberIds.has(u.id));

  async function addSelected() {
    if (!selected || adding) return;
    setAdding(true);
    try {
      await dealsApi.addMembers(dealId, [selected]);
      const added = available.find((u) => u.id === selected);
      toast.success(`${added?.name ?? "Member"} added to this deal.`);
      setSelected("");
      membersState.refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the member.",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-sm font-semibold">Team members</h2>
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          People with access to this deal and its calls.
        </p>

        {membersState.loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : membersState.error ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-[13px] text-muted-foreground">
              {membersState.error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={membersState.refetch}
            >
              Try again
            </Button>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-[13px] font-medium">No members yet</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Add a teammate below to give them access.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {members.map((member, i) => (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  i !== members.length - 1 && "border-b border-border",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-border bg-muted font-mono text-[10px] text-ink-soft">
                  {initialsOf(member.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">
                    {member.name}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                    {member.email}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                  {roleLabel(member.role)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Add a team member</h2>
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Give an existing teammate access to this deal. To add someone new to
          your organization, use the{" "}
          <Link to="/team" className="text-foreground underline hover:text-brand">
            Team
          </Link>{" "}
          page.
        </p>

        {orgState.loading ? (
          <div className="flex items-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : orgState.error ? (
          <p className="text-[12.5px] text-muted-foreground">
            {orgState.error}
          </p>
        ) : available.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Everyone in your organization already has access to this deal.
          </p>
        ) : (
          <div className="flex max-w-[460px] items-center gap-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-8 flex-1 font-sans text-[12.5px] font-normal normal-case tracking-normal">
                <SelectValue placeholder="Select a teammate…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} · {roleLabel(user.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={addSelected}
              disabled={!selected || adding}
            >
              {adding && <Loader2 className="size-4 animate-spin" />}
              Add to deal
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
