import { useMemo, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, dealsApi, type Deal } from "@/lib/api";
import { formatDate } from "@/lib/display";
import { useAsyncData } from "@/lib/useAsyncData";
import { cn } from "@/lib/utils";

export type DealsOutletContext = {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  rememberDeal: (deal: Deal) => void;
  setActiveDealId: (id: string | null) => void;
};

export function DealsLayout() {
  const { data, loading, error, refetch } = useAsyncData<Deal[]>(
    () => dealsApi.list(),
    [],
  );
  const [created, setCreated] = useState<Deal[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const { pathname } = useLocation();
  const dealIdFromPath = pathname.match(/^\/deals\/([^/]+)/)?.[1] ?? null;
  const selectedDealId = dealIdFromPath ?? activeDealId;
  const deals = useMemo(() => {
    const list = data ?? [];
    const ids = new Set(list.map((deal) => deal.id));
    const extra = created.filter((deal) => !ids.has(deal.id));
    return extra.length ? [...extra, ...list] : list;
  }, [data, created]);

  function rememberDeal(deal: Deal) {
    setCreated((prev) => [deal, ...prev.filter((d) => d.id !== deal.id)]);
    refetch();
  }

  return (
    <div className="flex h-full min-h-0">
      {deals.length > 0 ? (
        <DealList
          deals={deals}
          selectedDealId={selectedDealId}
          onCreated={rememberDeal}
        />
      ) : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <Outlet
          context={
            {
              deals,
              loading,
              error,
              refetch,
              rememberDeal,
              setActiveDealId,
            } satisfies DealsOutletContext
          }
        />
      </div>
    </div>
  );
}

function DealList({
  deals,
  selectedDealId,
  onCreated,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  onCreated: (deal: Deal) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((deal) => deal.name.toLowerCase().includes(q));
  }, [deals, query]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const deal = await dealsApi.create(trimmed);
      setName("");
      setCreateOpen(false);
      onCreated(deal);
      void navigate(`/deals/${deal.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not create the deal.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-background max-md:w-[220px]">
      <div className="shrink-0 border-b border-border px-3 pt-4 pb-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <Link
            to="/deals"
            className="text-[15px] font-semibold text-foreground hover:text-brand"
          >
            Deals
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-icon="inline-start"
            onClick={() => {
              setName("");
              setCreateOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            New deal
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals…"
            className="h-7 pl-8"
          />
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-name">Name</Label>
              <Input
                id="deal-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create deal
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
            No deals match “{query}”.
          </p>
        ) : (
          visible.map((deal) => (
            <NavLink
              key={deal.id}
              to={`/deals/${deal.id}`}
              className={cn(
                "block border-b border-border px-3 py-2.5 hover:bg-muted/50",
                selectedDealId === deal.id &&
                  "border-l-2 border-l-brand bg-brand-tint py-2.5 pr-3 pl-[10px]",
              )}
            >
              <div className="truncate text-[13px] font-medium">
                {deal.name}
              </div>
              <div className="mt-px font-mono text-[10.5px] text-muted-foreground">
                Created {formatDate(deal.created_at)}
              </div>
            </NavLink>
          ))
        )}
      </div>
    </aside>
  );
}
