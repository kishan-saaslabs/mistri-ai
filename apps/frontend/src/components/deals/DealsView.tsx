import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, dealsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DealsOutletContext } from "@/components/deals/DealsLayout";

const SUGGESTIONS = ["Acme Corp", "Northwind", "Brightline", "Vertex Systems"];

type DealMeta = { callCount: number };

export function DealsView() {
  const navigate = useNavigate();
  const { deals, loading, error, refetch, rememberDeal } =
    useOutletContext<DealsOutletContext>();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState<Record<string, DealMeta>>({});
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (deals.length === 0) {
      setMeta({});
      return;
    }
    let active = true;
    setMetaLoading(true);
    Promise.all(
      deals.map(async (deal) => {
        const calls = await dealsApi.calls(deal.id).catch(() => []);
        return [deal.id, { callCount: calls.length }] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setMeta(Object.fromEntries(entries));
      setMetaLoading(false);
    });
    return () => {
      active = false;
    };
  }, [deals]);

  const totals = useMemo(() => {
    const entries = Object.values(meta);
    const calls = entries.reduce((sum, m) => sum + m.callCount, 0);
    const empty = entries.filter((m) => m.callCount === 0).length;
    return { calls, empty };
  }, [meta]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const deal = await dealsApi.create(trimmed);
      setName("");
      rememberDeal(deal);
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
    <div className="mx-auto w-full max-w-[760px] px-7 pt-8 pb-[60px]">
      <h1 className="text-[22px] font-semibold tracking-tight">Overview</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Select a deal from the list, or create a new one.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Kpi label="Deals" value={deals.length} />
        <Kpi label="Total calls" value={totals.calls} loading={metaLoading} />
        <Kpi
          label="Empty deals"
          value={totals.empty}
          loading={metaLoading}
          muted
        />
      </div>
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
