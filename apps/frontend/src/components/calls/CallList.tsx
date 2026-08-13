import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { useWorkspace } from "@/state/workspace";
import { Button } from "@/components/ui/button";

const PROCESSING_STEPS = ["Transcribing…", "Checking evidence…", "Scoring deal…", "Queued"];

export function CallList() {
  const { calls, reps, deals, processing, currentCallId, selectCall, filteredCallIds, listFilter, setUploadOpen } =
    useWorkspace();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1400);
    return () => window.clearInterval(id);
  }, []);

  const all = Object.values(calls);
  let title = "All calls";
  let count = all.length;
  if (listFilter?.type === "rep") {
    title = `${reps[listFilter.key]?.name ?? "Rep"}'s calls`;
    count = filteredCallIds.length;
  } else if (listFilter?.type === "deal") {
    title = deals[listFilter.id]?.name ?? "Deal";
    count = filteredCallIds.length;
  } else if (listFilter?.type === "unassigned") {
    title = "Unassigned calls";
    count = filteredCallIds.length;
  }

  const showProcessing = !listFilter || listFilter.type === "rep";
  const repForFilter = listFilter?.type === "rep" ? listFilter.key : null;
  const queued = showProcessing ? processing.filter((item) => !repForFilter || item.rep === repForFilter) : [];

  return (
    <div className="h-full w-[300px] shrink-0 overflow-y-auto border-r border-border bg-background max-md:w-[240px]">
      <div className="px-[18px] pt-4 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto border-[#c9d8fb] bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand hover:bg-[#e2eafd] hover:text-brand"
            onClick={() => setUploadOpen(true)}
          >
            + Add call
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {count} call{count === 1 ? "" : "s"}
          {listFilter ? "" : " · this month"}
        </div>
      </div>

      {filteredCallIds.map((id) => {
        const call = calls[id]!;
        const rep = reps[call.rep];
        return (
          <button
            key={id}
            type="button"
            onClick={() => selectCall(id)}
            className={cn(
              "flex w-full items-center gap-2.5 border-b border-border px-[18px] py-[11px] text-left",
              id === currentCallId && "border-l-2 border-l-brand bg-brand-tint py-[11px] pr-[18px] pl-4",
              id !== currentCallId && "hover:bg-background",
            )}
          >
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full",
                call.statusColor === "success" && "bg-success",
                call.statusColor === "warning" && "bg-warning",
                call.statusColor === "danger" && "bg-danger",
                call.statusColor === "neutral" && "bg-[#b9bdbf]",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{call.label}</div>
              <div className="mt-px flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                <span>
                  {rep?.name} · {formatDuration(call.duration)} ·
                </span>
                {call.dealId && deals[call.dealId] ? (
                  <span className="inline-flex rounded-[5px] bg-muted px-2 py-px font-mono text-[10.5px] text-ink-soft">
                    {deals[call.dealId].name}
                  </span>
                ) : (
                  <span className="inline-flex rounded-[5px] bg-warning-tint px-2 py-px font-mono text-[10.5px] text-[#8a5a17]">
                    Unassigned
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-ink-soft">{typeof call.score === "number" ? call.score : "--"}</span>
          </button>
        );
      })}

      {queued.map((item) => {
        const rep = reps[item.rep];
        const step = item.sub === "Queued" ? "Queued" : PROCESSING_STEPS[tick % (PROCESSING_STEPS.length - 1)];
        return (
          <div key={item.id} className="flex items-center gap-2.5 border-b border-border px-[18px] py-[11px] opacity-50">
            <span className="size-[9px] shrink-0 animate-spin rounded-full border-2 border-[#e3e5e1] border-t-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{item.label}</div>
              <div className="font-mono text-[10.5px] text-muted-foreground">
                {rep?.name} · {item.sub === "Queued" ? "Queued" : step}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
