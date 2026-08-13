import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, dealsApi, type Deal } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";

const SUGGESTIONS = ["Acme Corp", "Northwind", "Brightline", "Vertex Systems"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function DealsView() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useAsyncData<Deal[]>(
    () => dealsApi.list(),
    [],
  );
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

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

  const deals = data ?? [];

  if (deals.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] pb-[60px] text-center">
        <div className="mx-auto mb-[18px] flex size-[46px] items-center justify-center rounded-[10px] bg-foreground text-base font-bold text-white">
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
    <div className="mx-auto w-full max-w-[760px] overflow-y-auto px-7 pt-10 pb-[60px]">
      <div className="mb-1.5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Deals</h1>
      </div>
      <p className="mb-[18px] text-[12.5px] text-muted-foreground">
        {deals.length} deal{deals.length === 1 ? "" : "s"}
      </p>
      <form onSubmit={submit} className="mb-[18px] flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New deal name…"
        />
        <Button type="submit" disabled={creating}>
          {creating && <Loader2 className="size-4 animate-spin" />}
          Create deal
        </Button>
      </form>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {deals.map((deal) => (
          <button
            key={deal.id}
            type="button"
            className="rounded-lg border border-border bg-background px-4 py-[15px] text-left hover:border-brand"
            onClick={() => navigate(`/deals/${deal.id}`)}
          >
            <div className="mb-1 truncate text-sm font-semibold">
              {deal.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              Created {formatDate(deal.created_at)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
