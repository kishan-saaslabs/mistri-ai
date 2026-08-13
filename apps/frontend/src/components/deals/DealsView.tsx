import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/state/workspace";

const SUGGESTIONS = ["Acme Corp", "Northwind", "Brightline", "Vertex Systems"];

export function DealsView() {
  const { deals, calls, createDeal, setListFilter } = useWorkspace();
  const [name, setName] = useState("");
  const dealList = Object.values(deals);
  const unassignedCount = Object.values(calls).filter((call) => !call.dealId).length;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (createDeal(name)) setName("");
  }

  if (dealList.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] pb-[60px] text-center">
        <div className="mx-auto mb-[18px] flex size-[46px] items-center justify-center rounded-[10px] bg-foreground text-base font-bold text-white">
          M
        </div>
        <h1 className="mb-2 text-xl font-semibold">Welcome to Mistri AI</h1>
        <p className="mx-auto mb-[26px] max-w-[44ch] text-[13.5px] text-muted-foreground">
          Create your first deal to start organizing calls as they come in. Once a deal exists, incoming calls can be
          mapped to it.
        </p>
        <form onSubmit={submit} className="mx-auto mb-4 flex max-w-[420px] gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Deal name, e.g. Acme Corp" />
          <Button type="submit">Create deal</Button>
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
        {dealList.length} deal{dealList.length === 1 ? "" : "s"}
      </p>
      <form onSubmit={submit} className="mb-[18px] flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New deal name…" />
        <Button type="submit">Create deal</Button>
      </form>
      {unassignedCount > 0 ? (
        <div className="mb-[18px] flex items-center justify-between gap-3 rounded-lg border border-[#f0dab8] bg-warning-tint px-[15px] py-[11px] text-[12.5px] text-[#8a5a17]">
          <span>
            {unassignedCount} call{unassignedCount === 1 ? "" : "s"} {unassignedCount === 1 ? "is" : "are"} waiting to be
            mapped to a deal.
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-auto shrink-0 border-[#8a5a17] bg-transparent px-2.5 py-1 text-xs text-[#8a5a17] hover:bg-transparent hover:text-[#8a5a17]"
            onClick={() => setListFilter({ type: "unassigned" })}
          >
            Review unassigned →
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {dealList.map((deal) => {
          const callCount = Object.values(calls).filter((call) => call.dealId === deal.id).length;
          return (
            <button
              key={deal.id}
              type="button"
              className="rounded-lg border border-border bg-background px-4 py-[15px] text-left hover:border-brand"
              onClick={() => setListFilter({ type: "deal", id: deal.id })}
            >
              <div className="mb-1 text-sm font-semibold">{deal.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {callCount} call{callCount === 1 ? "" : "s"} mapped
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
