import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthGauge } from "@/components/calls/HealthGauge";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/state/workspace";
import type { CallRecord, Rep } from "@/types/domain";

const SUGGESTIONS = [
  "Which reps have deals at risk right now?",
  "How is Sarah trending this month?",
  "What's the riskiest deal on the team?",
  "Summarize Melissa's Northwind call",
];

export function AskView() {
  const {
    askHistory,
    askContext,
    askBusy,
    setAskContext,
    askQuestion,
    calls,
    reps,
    selectCall,
    openEvidence,
  } = useWorkspace();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [askHistory, askBusy]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = inputRef.current?.value ?? "";
    askQuestion(value);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex h-full flex-col items-center">
      <div ref={scrollRef} className="flex w-full flex-1 justify-center overflow-y-auto">
        <div className="w-full max-w-[720px] px-6 pt-6 pb-2">
          {askContext && calls[askContext] ? (
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#c9d0f0] bg-brand-tint px-2.5 py-1 font-mono text-[11px] text-brand">
              Context: {calls[askContext].label}
              <button type="button" onClick={() => setAskContext(null)} aria-label="Clear context">
                ×
              </button>
            </div>
          ) : null}

          {askHistory.length === 0 && !askBusy ? (
            <div className="pt-[60px] text-center">
              <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-[10px] bg-foreground text-[15px] font-bold text-white">
                M
              </div>
              <h2 className="mb-1.5 text-[17px] font-semibold">Ask Mistri</h2>
              <p className="mb-[22px] text-[13px] text-muted-foreground">
                Ask about a deal or a rep — the answer renders right here, with the deal health, evidence, and next step,
                not just a summary.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-[7px] border border-border bg-background px-3.5 py-2 text-left text-[12.5px] text-ink-soft hover:border-brand hover:text-brand"
                    onClick={() => askQuestion(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            askHistory.map((entry, index) => (
              <div key={`${entry.role}-${index}`} className="mb-[22px]">
                {entry.role === "user" ? (
                  <div className="mb-2.5 text-[15px] font-semibold">{entry.text}</div>
                ) : (
                  <BotMessage
                    text={entry.text}
                    inlineCard={entry.inlineCard}
                    secondaryCard={entry.secondaryCard}
                    multiRepCards={entry.multiRepCards}
                    calls={calls}
                    reps={reps}
                    onOpenCall={(id) => {
                      selectCall(id);
                      void navigate("/calls");
                    }}
                    onEvidence={openEvidence}
                  />
                )}
              </div>
            ))
          )}
          {askBusy ? <Reasoning /> : null}
        </div>
      </div>
      <form onSubmit={submit} className="w-full max-w-[720px] px-6 pt-3 pb-[22px]">
        <div className="flex gap-2 rounded-[9px] border border-border bg-background py-1.5 pr-1.5 pl-3.5">
          <Input
            ref={inputRef}
            className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Ask a question…"
          />
          <Button type="submit" className="bg-brand text-white hover:bg-brand-hover">
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function BotMessage({
  text,
  inlineCard,
  secondaryCard,
  multiRepCards,
  calls,
  reps,
  onOpenCall,
  onEvidence,
}: {
  text: string;
  inlineCard?: { type: "deal" | "rep"; key: string };
  secondaryCard?: { type: "deal" | "rep"; key: string };
  multiRepCards?: string[];
  calls: Record<string, CallRecord>;
  reps: Record<string, Rep>;
  onOpenCall: (id: string) => void;
  onEvidence: (segId: string, callId?: string) => void;
}) {
  return (
    <div>
      <div className="text-sm leading-relaxed text-ink-soft">
        {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
          part.startsWith("**") ? (
            <b key={index} className="text-foreground">
              {part.slice(2, -2)}
            </b>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </div>
      {inlineCard?.type === "deal" && calls[inlineCard.key] ? (
        <DealCard call={calls[inlineCard.key]!} rep={reps[calls[inlineCard.key]!.rep]} onOpen={onOpenCall} onEvidence={onEvidence} />
      ) : null}
      {inlineCard?.type === "rep" && reps[inlineCard.key] ? <RepCard rep={reps[inlineCard.key]!} /> : null}
      {secondaryCard?.type === "deal" && calls[secondaryCard.key] ? (
        <DealCard call={calls[secondaryCard.key]!} rep={reps[calls[secondaryCard.key]!.rep]} onOpen={onOpenCall} onEvidence={onEvidence} />
      ) : null}
      {secondaryCard?.type === "rep" && reps[secondaryCard.key] ? <RepCard rep={reps[secondaryCard.key]!} /> : null}
      {multiRepCards?.map((key) => (reps[key] ? <RepCard key={key} rep={reps[key]!} /> : null))}
    </div>
  );
}

function DealCard({
  call,
  rep,
  onOpen,
  onEvidence,
}: {
  call: CallRecord;
  rep?: Rep;
  onOpen: (id: string) => void;
  onEvidence: (segId: string, callId?: string) => void;
}) {
  const topInsight = call.risks[0] ?? call.signals[0];
  const insightKind = call.risks[0] ? "danger" : "success";
  return (
    <div className="mt-3.5 rounded-lg border border-border bg-background px-[15px] py-3.5">
      <div className="flex items-center gap-3">
        <HealthGauge score={call.score} color={call.statusColor} size={46} stroke={4} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{call.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {rep?.name} ·
            <span
              className={cn(
                "inline-block size-[7px] rounded-full",
                call.statusColor === "success" && "bg-success",
                call.statusColor === "warning" && "bg-warning",
                call.statusColor === "danger" && "bg-danger",
                call.statusColor === "neutral" && "bg-[#b9bdbf]",
              )}
            />
            {call.verdict}
          </div>
        </div>
        <button type="button" className="shrink-0 font-mono text-[10.5px] text-brand hover:underline" onClick={() => onOpen(call.id)}>
          Open call →
        </button>
      </div>
      {topInsight ? (
        <div className="mt-0.5 flex gap-2.5 border-t border-border pt-2.5">
          <div className={cn("w-0.5 shrink-0 self-stretch rounded-sm", insightKind === "danger" ? "bg-danger" : "bg-success")} />
          <div>
            <div className="mb-0.5 text-[12.5px] font-semibold">{topInsight.title}</div>
            <p className="mb-1.5 text-xs text-ink-soft">{topInsight.desc}</p>
            <button
              type="button"
              className="font-mono text-[10.5px] text-brand hover:underline"
              onClick={() => onEvidence(topInsight.segId, call.id)}
            >
              View evidence →
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 border-t border-border pt-2.5 text-xs text-muted-foreground italic">Nothing flagged on this call.</p>
      )}
    </div>
  );
}

function RepCard({ rep }: { rep: Rep }) {
  return (
    <div className="mt-3.5 flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3">
      <div className="flex size-[30px] items-center justify-center rounded-[7px] border border-border bg-muted font-mono text-[10px]">
        {rep.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{rep.name}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {rep.role} · {rep.callsThisMonth} calls this month
        </div>
      </div>
      <div className="flex gap-4 text-center">
        <div>
          <b className="block font-mono text-[15px]">{rep.avgHealth ?? "--"}</b>
          <span className="text-[9.5px] tracking-wide text-muted-foreground uppercase">avg health</span>
        </div>
        <div>
          <b className="block font-mono text-[15px]">{rep.atRisk}</b>
          <span className="text-[9.5px] tracking-wide text-muted-foreground uppercase">at risk</span>
        </div>
      </div>
    </div>
  );
}

const REASONING_STEPS = ["Reading transcript", "Checking evidence", "Preparing answer"];

function Reasoning() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive((n) => Math.min(REASONING_STEPS.length, n + 1)), 260);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {REASONING_STEPS.map((step, index) => (
        <div
          key={step}
          className={cn(
            "flex items-center gap-2 font-mono text-[11.5px] text-muted-foreground opacity-40",
            index < active && "text-ink-soft opacity-100",
          )}
        >
          <span className="w-3 text-center">{index < active - 1 || active >= REASONING_STEPS.length ? "✓" : "○"}</span>
          {step}…
        </div>
      ))}
    </div>
  );
}
