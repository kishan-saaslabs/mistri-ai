import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HealthGauge } from "@/components/calls/HealthGauge";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/state/workspace";

export function CallDetail() {
  const { currentCall, currentCallId, reps, deals, mapCallToDeal, openEvidence, askAboutCall, highlightSegId } =
    useWorkspace();
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCursor(0);
  }, [currentCallId]);

  useEffect(() => {
    if (!highlightSegId) return;
    document.getElementById(`row-${highlightSegId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightSegId]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((sec) => {
        const next = Math.min(currentCall.duration, sec + 2);
        if (next >= currentCall.duration) {
          setPlaying(false);
        }
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, currentCall.duration]);

  const speakers = new Set(currentCall.segments.map((seg) => seg.speaker)).size;
  const pct = currentCall.duration ? (cursor / currentCall.duration) * 100 : 0;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-7 pt-5 pb-10">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">{currentCall.label}</h1>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {reps[currentCall.rep]?.name} · {currentCall.filename} · {formatDuration(currentCall.duration)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={currentCall.dealId ?? "unassigned"}
            onValueChange={(value) => mapCallToDeal(currentCallId, value === "unassigned" ? null : value)}
          >
            <SelectTrigger className="h-8 w-[160px] text-[12.5px]">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {Object.values(deals).map((deal) => (
                <SelectItem key={deal.id} value={deal.id}>
                  {deal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => toast("Export is simulated in this mock.")}>
            Export notes
          </Button>
          <Button className="bg-brand text-white hover:bg-brand-hover" onClick={() => askAboutCall(currentCallId)}>
            Ask about this call
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <section className="overflow-hidden rounded-lg border border-border bg-background">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Transcript</h3>
            <span className="font-mono text-[10.5px] text-muted-foreground">{speakers} speakers</span>
          </header>
          <div className="max-h-[440px] overflow-y-auto">
            {currentCall.segments.map((seg) => (
              <div
                key={seg.id}
                id={`row-${seg.id}`}
                className={cn(
                  "grid grid-cols-[48px_1fr] gap-2.5 border-l-2 border-transparent px-4 py-2.5",
                  highlightSegId === seg.id && "border-l-brand bg-brand-tint",
                )}
              >
                <div className="pt-0.5 font-mono text-[11px] text-muted-foreground">{seg.t}</div>
                <div>
                  <div className="mb-0.5 text-[10.5px] font-semibold text-ink-soft">{seg.speaker}</div>
                  <p className="text-[13.5px] leading-normal">{seg.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border hover:border-brand hover:text-brand"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
            </button>
            <button
              type="button"
              className="relative h-[3px] flex-1 cursor-pointer rounded-sm bg-border"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const next = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                setCursor(Math.floor(next * currentCall.duration));
              }}
            >
              <span className="absolute inset-y-0 left-0 rounded-sm bg-brand" style={{ width: `${pct}%` }} />
            </button>
            <span className="min-w-[88px] shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">
              {formatDuration(cursor)} / {formatDuration(currentCall.duration)}
            </span>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-background">
          <header className="border-b border-border px-4 py-2.5">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Deal intelligence</h3>
          </header>
          <div className="p-4">
            <div className="mb-[15px] flex items-center gap-4 border-b border-border pb-[15px]">
              <HealthGauge score={currentCall.score} color={currentCall.statusColor} />
              <div>
                <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Deal health</p>
                <p className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                  <span
                    className={cn(
                      "inline-block size-[7px] rounded-full",
                      currentCall.statusColor === "success" && "bg-success",
                      currentCall.statusColor === "warning" && "bg-warning",
                      currentCall.statusColor === "danger" && "bg-danger",
                      currentCall.statusColor === "neutral" && "bg-[#b9bdbf]",
                    )}
                  />
                  {currentCall.verdict}
                </p>
              </div>
            </div>

            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Customer intent
            </h4>
            {currentCall.intent.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Not enough conversation to gauge plan interest.</p>
            ) : (
              currentCall.intent.map((item) => (
                <div key={item.plan} className="mb-1.5 grid grid-cols-[66px_1fr_36px] items-center gap-2 text-[12.5px]">
                  <span>{item.plan}</span>
                  <div className="h-1.5 overflow-hidden rounded-[3px] border border-border bg-background">
                    <span className="block h-full bg-brand" style={{ width: `${item.pct}%` }} />
                  </div>
                  <span className="text-right font-mono text-[11px] text-muted-foreground">{item.pct}%</span>
                </div>
              ))
            )}

            <div className="h-3.5" />
            <InsightBlock title="Buying signals" empty="No buying signals surfaced." items={currentCall.signals} kind="success" onEvidence={openEvidence} />
            <InsightBlock title="Deal risks" empty="No risks flagged." items={currentCall.risks} kind="danger" onEvidence={openEvidence} />

            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Next steps
            </h4>
            <ul>
              {currentCall.nextSteps.map((step) => (
                <li key={step.text} className="flex items-baseline gap-2 border-b border-border py-1.5 text-[12.5px] last:border-b-0">
                  <span className="shrink-0 font-mono text-muted-foreground">{step.done ? "done" : "open"}</span>
                  <span>{step.text}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">{step.owner}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function InsightBlock({
  title,
  empty,
  items,
  kind,
  onEvidence,
}: {
  title: string;
  empty: string;
  items: Array<{ title: string; desc: string; segId: string }>;
  kind: "success" | "danger";
  onEvidence: (segId: string) => void;
}) {
  return (
    <div className="mb-3">
      <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{empty}</p>
      ) : (
        items.map((item) => (
          <div key={item.title} className="flex gap-2.5 border-b border-border py-2 last:border-b-0">
            <div className={cn("w-0.5 shrink-0 self-stretch rounded-sm", kind === "success" ? "bg-success" : "bg-danger")} />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[12.5px] font-semibold">{item.title}</div>
              <p className="mb-1.5 text-xs leading-snug text-ink-soft">{item.desc}</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-[10.5px] text-brand hover:underline"
                onClick={() => onEvidence(item.segId)}
              >
                View evidence →
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
