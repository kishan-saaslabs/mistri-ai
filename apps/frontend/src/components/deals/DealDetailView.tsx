import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Sparkles, UserPlus } from "lucide-react";
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
import { MorphFrame, MorphIn, SkeletonLine } from "@/components/ui/skeleton";
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
} from "@/lib/api";
import { formatDate, initialsOf, roleLabel } from "@/lib/display";
import { queryErrorMessage, queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import type { DealsOutletContext } from "@/components/deals/DealsLayout";

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
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: queryKeys.dealCalls(dealId),
    queryFn: () => dealsApi.calls(dealId),
    enabled: Boolean(dealId),
  });
  const pendingIds = (list.data ?? [])
    .filter((call) => isPendingStatus(call.status))
    .map((call) => call.id);
  const pending = useQueries({
    queries: pendingIds.map((id) => ({
      queryKey: queryKeys.call(id),
      queryFn: async () => {
        const detail = await callsApi.get(id);
        queryClient.setQueryData<Call[]>(
          queryKeys.dealCalls(dealId),
          (prev) =>
            prev?.map((row) =>
              row.id === detail.call.id ? detail.call : row,
            ) ?? prev,
        );
        return detail;
      },
      refetchInterval: POLL_MS,
    })),
  });
  const overrides = new Map(
    pending.flatMap((q) => (q.data ? [[q.data.call.id, q.data.call] as const] : [])),
  );
  const calls = (list.data ?? []).map((call) => overrides.get(call.id) ?? call);

  return {
    calls,
    loading: list.isPending,
    error: list.error ? queryErrorMessage(list.error) : null,
    refetch: () => void list.refetch(),
  };
}

export function DealDetailView() {
  const queryClient = useQueryClient();
  const { id = "" } = useParams();
  const {
    deals,
    loading: dealsLoading,
    error: dealsError,
  } = useOutletContext<DealsOutletContext>();
  const [tab, setTab] = useState("calls");
  const [addOpen, setAddOpen] = useState(false);

  const deal = deals.find((d) => d.id === id) ?? null;
  const callsState = useDealCalls(id);
  const membersQuery = useQuery({
    queryKey: queryKeys.dealMembers(id),
    queryFn: () => dealsApi.members(id),
    enabled: Boolean(id),
  });
  const membersState = {
    data: membersQuery.data ?? null,
    loading: membersQuery.isPending,
    error: membersQuery.error ? queryErrorMessage(membersQuery.error) : null,
    refetch: () => void membersQuery.refetch(),
  };

  if (dealsLoading && !deal) {
    return <DealDetailSkeleton />;
  }

  if (!deal) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] text-center">
        <p className="mb-3 text-[13.5px] text-muted-foreground">
          {dealsError ?? "This deal could not be found."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/deals">Back to overview</Link>
        </Button>
      </div>
    );
  }
  const members = membersState.data ?? [];
  const callCount = callsState.calls.length;

  return (
    <div className="mx-auto w-full max-w-[900px] overflow-y-auto px-4 pt-6 pb-[60px] md:px-7 md:pt-8">
      <Link
        to="/deals"
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground md:hidden"
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
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            Created {formatDate(deal.created_at)}
          </p>
          <div className="mt-2.5 flex gap-7">
            <Stat
              label="Calls"
              value={callsState.loading ? undefined : callCount}
            />
            <Stat
              label="Members"
              value={membersState.loading ? undefined : members.length}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" data-icon="inline-start">
            <Link
              to="/ask/new"
              state={{
                attach: { type: "deal" as const, id: deal.id, name: deal.name },
              }}
            >
              <Sparkles className="size-3.5" />
              Ask Mistri
            </Link>
          </Button>
          <Button
            type="button"
            data-icon="inline-start"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" />
            Add call
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="w-full border-b border-border">
          <TabsList
            variant="line"
            className="h-auto w-fit justify-start gap-0 rounded-none bg-transparent p-0"
          >
            <TabsTrigger
              value="calls"
              className="flex-none rounded-none px-3 pb-2.5 first:pl-0"
            >
              Calls
              <TabCount loading={callsState.loading}>{callCount}</TabCount>
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="flex-none rounded-none px-3 pb-2.5"
            >
              Settings
              <TabCount loading={membersState.loading}>
                {members.length}
              </TabCount>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calls" className="pt-5">
          <CallsTab
            calls={callsState.calls}
            loading={callsState.loading}
            error={callsState.error}
            refetch={callsState.refetch}
            onAddCall={() => setAddOpen(true)}
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
        onAdded={(call) => {
          queryClient.setQueryData<Call[]>(
            queryKeys.dealCalls(id),
            (prev) => (prev ? [call, ...prev] : [call]),
          );
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <div className="flex flex-col">
      <MorphFrame
        loading={value === undefined}
        className="h-5 min-w-6 rounded-sm text-[16px] leading-none font-semibold tabular-nums"
      >
        {value}
      </MorphFrame>
      <span className="mt-0.5 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

function TabCount({
  children,
  loading,
}: {
  children?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full border border-border bg-muted px-1.5 font-mono text-[10px] leading-none tabular-nums text-ink-soft",
        loading && "animate-pulse text-transparent",
      )}
    >
      {loading ? "0" : children}
    </span>
  );
}

function CallsTab({
  calls,
  loading,
  error,
  refetch,
  onAddCall,
}: {
  calls: Call[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  onAddCall: () => void;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 5 }, (_, i) => (
          <CallRowSkeleton key={i} last={i === 4} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center">
        <p className="mb-3 text-[13px] text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
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
          onClick={onAddCall}
        >
          <Plus className="size-3.5" />
          Add call
        </Button>
      </div>
    );
  }

  return (
    <MorphIn className="overflow-hidden rounded-xl border border-border">
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
    </MorphIn>
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
  const queryClient = useQueryClient();
  const orgQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
  });

  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);

  const members = membersState.data ?? [];
  const orgUsers = orgQuery.data ?? [];

  const memberIds = new Set(members.map((m) => m.id));
  const available = orgUsers.filter((u) => !memberIds.has(u.id));

  async function addSelected() {
    if (!selected || adding) return;
    setAdding(true);
    try {
      const next = await dealsApi.addMembers(dealId, [selected]);
      queryClient.setQueryData(queryKeys.dealMembers(dealId), next);
      const added = available.find((u) => u.id === selected);
      toast.success(`${added?.name ?? "Member"} added to this deal.`);
      setSelected("");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the member.",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Team members</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            People with access to this deal and its calls.
          </p>
        </div>
        {orgQuery.isPending ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 min-w-[200px] animate-pulse rounded-lg border border-border bg-muted" />
            <span className="inline-flex h-8 w-[118px] animate-pulse rounded-lg bg-muted" />
          </div>
        ) : orgQuery.error ? (
          <p className="text-[12.5px] text-muted-foreground">
            {queryErrorMessage(orgQuery.error)}
          </p>
        ) : available.length > 0 ? (
          <div className="flex min-w-0 max-w-[460px] flex-1 items-center justify-end gap-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-8 min-w-[200px] font-sans text-[12.5px] font-normal normal-case tracking-normal">
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
              data-icon="inline-start"
              onClick={addSelected}
              disabled={!selected}
              pending={adding}
            >
              <UserPlus className="size-3.5" />
              Add member
            </Button>
          </div>
        ) : null}
      </div>

      {membersState.loading ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {Array.from({ length: 4 }, (_, i) => (
            <MemberRowSkeleton key={i} last={i === 3} />
          ))}
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
            Add a teammate above to give them access.
          </p>
        </div>
      ) : (
        <MorphIn className="overflow-hidden rounded-lg border border-border">
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
        </MorphIn>
      )}
    </div>
  );
}

function CallRowSkeleton({ last }: { last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        !last && "border-b border-border",
      )}
    >
      <span className="size-[7px] shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          <SkeletonLine className="w-[55%]" />
        </div>
        <div className="mt-px font-mono text-[10.5px]">
          <SkeletonLine className="w-[40%]" />
        </div>
      </div>
    </div>
  );
}

function MemberRowSkeleton({ last }: { last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        !last && "border-b border-border",
      )}
    >
      <span className="size-7 shrink-0 animate-pulse rounded-[6px] border border-border bg-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          <SkeletonLine className="w-[40%]" />
        </div>
        <div className="truncate font-mono text-[10.5px]">
          <SkeletonLine className="w-[55%]" />
        </div>
      </div>
      <span className="shrink-0 animate-pulse rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-transparent">
        Member
      </span>
    </div>
  );
}

function DealDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[900px] overflow-y-auto px-4 pt-6 pb-[60px] md:px-7 md:pt-8">
      <div className="mb-3 text-[12.5px] md:hidden">
        <SkeletonLine className="w-20" />
      </div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">
            <SkeletonLine className="w-48" />
          </h1>
          <p className="mt-0.5 font-mono text-[11px]">
            <SkeletonLine className="w-36" />
          </p>
          <div className="mt-2.5 flex gap-7">
            <div className="flex flex-col">
              <span className="h-5 w-6 animate-pulse rounded-sm bg-muted" />
              <span className="mt-0.5 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Calls
              </span>
            </div>
            <div className="flex flex-col">
              <span className="h-5 w-6 animate-pulse rounded-sm bg-muted" />
              <span className="mt-0.5 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Members
              </span>
            </div>
          </div>
        </div>
        <span className="inline-flex h-8 w-[92px] animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="w-full border-b border-border">
        <div className="flex gap-0">
          <div className="flex items-center gap-1.5 px-3 pb-2.5 pl-0 text-sm font-medium">
            Calls
            <TabCount loading />
          </div>
          <div className="flex items-center gap-1.5 px-3 pb-2.5 text-sm font-medium">
            Settings
            <TabCount loading />
          </div>
        </div>
      </div>
      <div className="pt-5">
        <div className="overflow-hidden rounded-xl border border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <CallRowSkeleton key={i} last={i === 4} />
          ))}
        </div>
      </div>
    </div>
  );
}
