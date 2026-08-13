import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, dealsApi, type AuthUser, type Deal } from "@/lib/api";
import { formatDate, initialsOf } from "@/lib/display";
import { useAsyncData } from "@/lib/useAsyncData";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Acme Corp", "Northwind", "Brightline", "Vertex Systems"];

type DealMeta = { callCount: number; members: AuthUser[] };
type Filter = "all" | "active" | "empty";

export function DealsView() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useAsyncData<Deal[]>(
    () => dealsApi.list(),
    [],
  );

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Enrich each deal with its call count + members (the list endpoint returns
  // bare deals). Loaded progressively after the deals resolve.
  const [meta, setMeta] = useState<Record<string, DealMeta>>({});
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!data || data.length === 0) {
      setMeta({});
      return;
    }
    let active = true;
    setMetaLoading(true);
    Promise.all(
      data.map(async (deal) => {
        const [calls, members] = await Promise.all([
          dealsApi.calls(deal.id).catch(() => []),
          dealsApi.members(deal.id).catch(() => []),
        ]);
        return [deal.id, { callCount: calls.length, members }] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setMeta(Object.fromEntries(entries));
      setMetaLoading(false);
    });
    return () => {
      active = false;
    };
  }, [data]);

  const deals = data ?? [];

  const totals = useMemo(() => {
    const entries = Object.values(meta);
    const calls = entries.reduce((sum, m) => sum + m.callCount, 0);
    const empty = entries.filter((m) => m.callCount === 0).length;
    return { calls, empty };
  }, [meta]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((deal) => {
      if (q && !deal.name.toLowerCase().includes(q)) return false;
      const count = meta[deal.id]?.callCount ?? 0;
      if (filter === "active") return count > 0;
      if (filter === "empty") return count === 0;
      return true;
    });
  }, [data, query, filter, meta]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const deal = await dealsApi.create(trimmed);
      setName("");
      void navigate(`/deals/${deal.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not create the deal.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] text-center">
        <p className="mb-3 text-[13.5px] text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  // Empty org — keep the welcoming first-run state.
  if (deals.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] pb-[60px] text-center">
        <div className="mx-auto mb-[18px] flex size-[46px] items-center justify-center rounded-[10px] bg-foreground text-base font-bold text-background">
          M
        </div>
        <h1 className="mb-2 text-xl font-semibold">Welcome to Mistri AI</h1>
        <p className="mx-auto mb-[26px] max-w-[44ch] text-[13.5px] text-muted-foreground">
          Create your first deal to start organizing calls as they come in. Once
          a deal exists, incoming calls can be mapped to it.
        </p>
        <form onSubmit={submit} className="mx-auto mb-4 flex max-w-[420px] gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Deal name, e.g. Acme Corp"
          />
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Create deal
          </Button>
        </form>
        <div className="flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-full border border-border px-3 py-1.5 text-xs text-ink-soft hover:border-brand hover:text-brand"
              onClick={() => setName(item)}
            >
              + {item}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] overflow-y-auto px-7 pt-8 pb-[60px]">
      {/* Page header */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Deals</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Your pipeline, organized by account.
          </p>
        </div>
        <Button
          type="button"
          data-icon="inline-start"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          <Plus className="size-4" />
          New deal
        </Button>
      </div>

      {/* Inline create (toggled by header button) */}
      {showCreate && (
        <form
          onSubmit={submit}
          className="mb-4 flex gap-2 rounded-lg border border-border bg-muted/40 p-2"
        >
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Deal name, e.g. Acme Corp"
          />
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShowCreate(false);
              setName("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Deals" value={deals.length} />
        <Kpi label="Total calls" value={totals.calls} loading={metaLoading} />
        <Kpi
          label="Empty deals"
          value={totals.empty}
          loading={metaLoading}
          muted
        />
      </div>

      {/* Toolbar: search + filter */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals…"
            className="pl-8"
          />
        </div>
        <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
          {(["all", "active", "empty"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] capitalize transition-colors",
                filter === key
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">
          No deals match “{query}”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {visible.map((deal, i) => {
            const m = meta[deal.id];
            return (
              <button
                key={deal.id}
                type="button"
                onClick={() => navigate(`/deals/${deal.id}`)}
                className={cn(
                  "flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
                  i !== visible.length - 1 && "border-b border-border",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {deal.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                    {m
                      ? `${m.callCount} call${m.callCount === 1 ? "" : "s"} · ${m.members.length} member${m.members.length === 1 ? "" : "s"} · created ${formatDate(deal.created_at)}`
                      : `created ${formatDate(deal.created_at)}`}
                  </div>
                </div>

                <ActivityPill count={m?.callCount} pending={!m} />

                <MemberStack members={m?.members} />

                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  muted,
}: {
  label: string;
  value: number;
  loading?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[22px] font-semibold tabular-nums",
          muted && value > 0 && "text-warning",
        )}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function ActivityPill({ count, pending }: { count?: number; pending: boolean }) {
  if (pending) {
    return (
      <span className="hidden shrink-0 rounded-full border border-border px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
        …
      </span>
    );
  }
  const active = (count ?? 0) > 0;
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] sm:inline",
        active
          ? "bg-success-tint text-success"
          : "border border-border text-ink-soft",
      )}
    >
      {active ? "Active" : "Empty"}
    </span>
  );
}

function MemberStack({ members }: { members?: AuthUser[] }) {
  if (!members || members.length === 0) {
    return <span className="w-[52px] shrink-0" aria-hidden />;
  }
  const shown = members.slice(0, 3);
  const extra = members.length - shown.length;
  return (
    <div className="flex shrink-0 items-center">
      {shown.map((member, idx) => (
        <span
          key={member.id}
          title={member.name}
          className={cn(
            "flex size-6 items-center justify-center rounded-md border border-border bg-muted font-mono text-[9px] text-ink-soft ring-2 ring-background",
            idx !== 0 && "-ml-1.5",
          )}
        >
          {initialsOf(member.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 flex size-6 items-center justify-center rounded-md border border-border bg-muted/60 font-mono text-[9px] text-muted-foreground ring-2 ring-background">
          +{extra}
        </span>
      )}
    </div>
  );
}
