import { useMemo, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { motionTransition, springs } from "@/lib/motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MorphIn, SkeletonLine } from "@/components/ui/skeleton";
import { ApiError, dealsApi, type Deal } from "@/lib/api";
import { formatDate } from "@/lib/display";
import { queryErrorMessage, queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type DealsOutletContext = {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  rememberDeal: (deal: Deal) => void;
  setActiveDealId: (id: string | null) => void;
};

export function DealsLayout() {
  const queryClient = useQueryClient();
  const dealsQuery = useQuery({
    queryKey: queryKeys.deals,
    queryFn: dealsApi.list,
  });
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const { pathname } = useLocation();
  const dealIdFromPath = pathname.match(/^\/deals\/([^/]+)/)?.[1] ?? null;
  const selectedDealId = dealIdFromPath ?? activeDealId;
  const onOverview = pathname === "/deals";
  const deals = dealsQuery.data ?? [];
  const loading = dealsQuery.isPending;
  const error = dealsQuery.error ? queryErrorMessage(dealsQuery.error) : null;

  function rememberDeal(deal: Deal) {
    queryClient.setQueryData<Deal[]>(queryKeys.deals, (prev) =>
      prev ? [deal, ...prev.filter((d) => d.id !== deal.id)] : [deal],
    );
  }

  const showDealList = loading || deals.length > 0;

  return (
    <div className="flex h-full min-h-0">
      {showDealList ? (
        <DealList
          deals={deals}
          loading={loading && deals.length === 0}
          selectedDealId={selectedDealId}
          onOverview={onOverview}
          onCreated={rememberDeal}
        />
      ) : null}
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          onOverview && showDealList && "max-md:hidden",
        )}
      >
        <Outlet
          context={
            {
              deals,
              loading,
              error,
              refetch: () => void dealsQuery.refetch(),
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
  loading,
  selectedDealId,
  onOverview,
  onCreated,
}: {
  deals: Deal[];
  loading: boolean;
  selectedDealId: string | null;
  onOverview: boolean;
  onCreated: (deal: Deal) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const reduce = useReducedMotion();

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
    <aside
      className={cn(
        "flex h-full w-full shrink-0 flex-col border-r border-border bg-background md:w-[260px]",
        !onOverview && "max-md:hidden",
      )}
    >
      <div className="shrink-0 px-3 pt-4 pb-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <Link
            to="/deals"
            className="text-[15px] font-semibold text-foreground"
          >
            Deals
          </Link>
          <Button
            type="button"
            size="sm"
            data-icon="inline-start"
            onClick={() => {
              setName("");
              setCreateOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals…"
            className="h-8 bg-muted/60 pl-8 dark:bg-input/40"
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
              <Button
                type="submit"
                disabled={creating || !name.trim()}
                pending={creating}
              >
                Create deal
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">
            No deals match “{query}”.
          </p>
        ) : (
          <MorphIn>
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((deal) => {
                const selected = selectedDealId === deal.id;
                return (
                  <motion.div
                    key={deal.id}
                    layout
                    initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }
                    }
                    transition={motionTransition(reduce, springs.smooth)}
                  >
                    <NavLink
                      to={`/deals/${deal.id}`}
                      className="relative block min-w-0 rounded-lg px-2.5 py-2 hover:bg-muted/50"
                    >
                      {selected ? (
                        <motion.span
                          layoutId="deal-list-pill"
                          className="absolute inset-0 rounded-lg bg-brand-tint"
                          transition={motionTransition(reduce, springs.pill)}
                        />
                      ) : null}
                      <div className="relative z-1 truncate text-[13px] font-medium">
                        {deal.name}
                      </div>
                      <div className="relative z-1 mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(deal.created_at)}
                      </div>
                    </NavLink>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </MorphIn>
        )}
      </div>
    </aside>
  );
}
