import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
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

export function DealDetailView() {
  const { id = "" } = useParams();

  const dealState = useAsyncData<Deal | null>(
    () => dealsApi.list().then((deals) => deals.find((d) => d.id === id) ?? null),
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

  return (
    <div className="mx-auto w-full max-w-[820px] overflow-y-auto px-7 pt-8 pb-[60px]">
      <Link
        to="/deals"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All deals
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-semibold">{deal.name}</h1>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          Created {formatDate(deal.created_at)}
        </p>
      </div>

      <Tabs defaultValue="calls">
        <TabsList>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="pt-5">
          <CallsTab dealId={id} />
        </TabsContent>

        <TabsContent value="settings" className="pt-5">
          <SettingsTab dealId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CallsTab({ dealId }: { dealId: string }) {
  const { data, loading, error, refetch } = useAsyncData<Call[]>(
    () => dealsApi.calls(dealId),
    [dealId],
  );
  const [addOpen, setAddOpen] = useState(false);
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted-foreground">
          {loading
            ? "Loading calls…"
            : `${calls.length} call${calls.length === 1 ? "" : "s"} in this deal`}
        </p>
        <Button
          type="button"
          size="sm"
          data-icon="inline-start"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5" />
          Add call
        </Button>
      </div>

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
            Upload a recording or paste a link and it’ll be mapped to this deal.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4"
            data-icon="inline-start"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" />
            Add call
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
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
                  className={cn("size-[7px] shrink-0 rounded-full", status.dot)}
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

      <AddCallDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        dealId={dealId}
        onAdded={() => {
          setOverrides({});
          refetch();
        }}
      />
    </div>
  );
}

function SettingsTab({ dealId }: { dealId: string }) {
  const membersState = useAsyncData<AuthUser[]>(
    () => dealsApi.members(dealId),
    [dealId],
  );
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
