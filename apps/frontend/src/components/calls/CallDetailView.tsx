import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration } from "@/lib/format";
import {
  ApiError,
  callsApi,
  type CallDetail,
  type TranscriptSegment,
  type Transcription,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const SPEAKER_TONES = [
  { border: "border-l-brand", pill: "bg-brand-tint text-brand" },
  { border: "border-l-warning", pill: "bg-warning-tint text-[#8a5a17]" },
  { border: "border-l-success", pill: "bg-success-tint text-success" },
  { border: "border-l-danger", pill: "bg-danger-tint text-danger" },
] as const;

// ponytail: intel is hardcoded until the analysis API exists
const DEMO_INTEL = {
  runStatus: "Shipped",
  summary: {
    title: "Ready to move forward on Pro",
    desc: "Customer confirmed readiness to proceed with the Pro plan after discussing pricing.",
    segId: "seg_0003",
    quote: "we're ready to move forward with the Pro plan",
  },
  objection: {
    title: "Pricing higher than today",
    desc: "Customer said pricing is higher than their current spend.",
    segId: "seg_0002",
    quote: "pricing gave us pause",
  },
  intent: { title: "Buy Pro 86%", segId: "seg_0003", quote: "ready to move forward with the Pro plan" },
  nextSteps: [
    {
      text: "Send security documentation today",
      owner: "REP",
      segId: "seg_0004",
      quote: "I'll get the security docs over today",
    },
    {
      text: "Review proposal and follow up Friday",
      owner: "CUSTOMER",
      segId: "seg_0005",
      quote: "circle back Friday",
    },
  ],
  email: {
    subject: "Acme Pro renewal — security docs + Friday check-in",
    body: "Hi team,",
  },
};

const POLL_MS = 5_000;

function isPending(detail: CallDetail) {
  return (
    detail.call.status === "queued" ||
    detail.call.status === "processing" ||
    detail.transcriptions.some((row) => row.status === "processing")
  );
}

function latestTranscription(rows: Transcription[]) {
  return rows[0] ?? null;
}

function visibleSegments(row: Transcription | null): TranscriptSegment[] {
  const raw = Array.isArray(row?.segments) ? row.segments : [];
  const withText = raw.filter((seg) => seg.text.trim());
  const finals = withText.filter((seg) => seg.type !== "partial");
  return finals.length > 0 ? finals : withText;
}

function speakerKey(speaker: string | null) {
  return speaker?.trim() || "speaker_0";
}

function prettySpeaker(raw: string) {
  const match = raw.match(/^(?:speaker|spk)[_-]?(\d+)$/i);
  if (match) return `Speaker ${Number(match[1]) + 1}`;
  return raw.replace(/_/g, " ");
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 8);
}

function modelLabel(model: string | undefined) {
  if (!model) return "—";
  return model.replace(/^pyai-hear-/, "");
}

function uniqueSpeakerKeys(segments: TranscriptSegment[]) {
  const keys: string[] = [];
  for (const seg of segments) {
    const key = speakerKey(seg.speaker);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function toneFor(key: string, keys: string[]) {
  const index = Math.max(0, keys.indexOf(key));
  return SPEAKER_TONES[index % SPEAKER_TONES.length]!;
}

function resolveSeg(
  segId: string,
  segments: TranscriptSegment[],
): TranscriptSegment | undefined {
  const byId = segments.find((seg) => seg.id === segId);
  if (byId) return byId;
  const n = Number(segId.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return segments[n - 1];
}

type Evidence = {
  segId: string;
  speaker: string;
  time: string;
  quote: string;
  targetId: string | null;
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "call"
  );
}

function toMarkdown(title: string, segments: TranscriptSegment[]) {
  const lines = [`# ${title}`, ""];
  for (const seg of segments) {
    const who = prettySpeaker(speakerKey(seg.speaker));
    const time = seg.start != null ? formatDuration(seg.start) : "";
    lines.push(`**${who}**${time ? ` · ${time}` : ""}`);
    lines.push(seg.text);
    lines.push("");
  }
  if (segments.length === 0) lines.push("_No transcript._");
  return lines.join("\n");
}

export function CallDetailView() {
  const { id = "" } = useParams();
  const [data, setData] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    callsApi
      .get(id)
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, nonce]);

  const pending = data ? isPending(data) : false;
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const timer = window.setInterval(() => {
      callsApi
        .get(id)
        .then((next) => {
          if (active) setData(next);
        })
        .catch(() => {
          // Keep the last successful payload while a poll fails.
        });
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pending, id]);

  useEffect(() => {
    if (!highlightId) return;
    document
      .getElementById(`row-${highlightId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const transcription = data ? latestTranscription(data.transcriptions) : null;
  const segments = useMemo(
    () => visibleSegments(transcription),
    [transcription],
  );
  const speakerKeys = useMemo(
    () => uniqueSpeakerKeys(segments),
    [segments],
  );

  function openEvidence(segId: string, fallbackQuote?: string) {
    const target = resolveSeg(segId, segments);
    const fromTranscript = target?.text.trim();
    const snippet = fallbackQuote?.trim();
    const quote =
      fromTranscript && snippet && fromTranscript.toLowerCase().includes(snippet.toLowerCase())
        ? snippet
        : fromTranscript || snippet || "—";
    setEvidence({
      segId,
      speaker: target ? speakerKey(target.speaker) : "speaker_1",
      time: target?.start != null ? formatDuration(target.start) : "—",
      quote,
      targetId: target?.id ?? null,
    });
  }

  function jumpToTranscript() {
    const targetId = evidence?.targetId;
    setEvidence(null);
    if (!targetId) return;
    setHighlightId(targetId);
    requestAnimationFrame(() => {
      document
        .getElementById(`row-${targetId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-7 pt-[60px] text-center">
        <p className="mb-3 text-[13.5px] text-muted-foreground">
          {error ?? "This call could not be found."}
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/deals">Back to deals</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNonce((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { call, transcriptions } = data;
  const duration = transcription?.duration_seconds ?? call.duration_seconds;
  const failed =
    call.status === "failed" || transcription?.status === "failed";
  const ready = transcription?.status === "ready";
  const backTo = call.deal_id ? `/deals/${call.deal_id}` : "/deals";
  const backLabel = call.deal_id ? "Back to deal" : "All deals";
  const fileBase = slugify(call.label);

  function exportJson() {
    downloadText(
      `${fileBase}.json`,
      JSON.stringify(transcription ?? { call, transcriptions }, null, 2),
      "application/json",
    );
  }

  function exportMarkdown() {
    downloadText(
      `${fileBase}.md`,
      toMarkdown(call.label, segments),
      "text/markdown;charset=utf-8",
    );
  }

  async function shareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-7 pt-4 pb-6">
      <Link
        to={backTo}
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {backLabel}
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">
            {call.label}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {pending ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-tint px-2 py-0.5 font-mono text-[11px] font-medium text-warning">
                <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                Processing
              </span>
            ) : null}
            <p className="font-mono text-[11.5px] text-muted-foreground">
              {shortId(call.id)} · {modelLabel(transcription?.model)} ·{" "}
              {formatDuration(duration)} · {segments.length} line
              {segments.length === 1 ? "" : "s"} · {speakerKeys.length} speaker
              {speakerKeys.length === 1 ? "" : "s"}
            </p>
            {speakerKeys.map((key) => (
              <span
                key={key}
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                  toneFor(key, speakerKeys).pill,
                )}
              >
                {prettySpeaker(key)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!ready}
            onClick={exportMarkdown}
          >
            Markdown
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!transcription}
            onClick={exportJson}
          >
            JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void shareLink()}>
            Share link
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Transcript
            </h3>
            <span
              className={cn(
                "font-mono text-[10.5px]",
                pending ? "text-warning" : "text-muted-foreground",
              )}
            >
              {pending ? "processing" : `${segments.length} line${segments.length === 1 ? "" : "s"}`}
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pending && segments.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 bg-warning-tint/70 px-4">
                <Loader2 className="size-4 animate-spin text-warning" />
                <p className="text-[13px] font-medium text-warning">
                  Transcribing…
                </p>
              </div>
            ) : failed && segments.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-4 text-center">
                <p className="text-[13px] font-medium">Transcription failed</p>
                <p className="mt-1 max-w-[42ch] text-[12.5px] text-muted-foreground">
                  {transcription?.error || "The recording could not be transcribed."}
                </p>
              </div>
            ) : segments.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4">
                <p className="text-[13px] text-muted-foreground">
                  No transcript yet.
                </p>
              </div>
            ) : (
              segments.map((seg) => {
                const key = speakerKey(seg.speaker);
                const tone = toneFor(key, speakerKeys);
                return (
                  <div
                    key={seg.id}
                    id={`row-${seg.id}`}
                    className={cn(
                      "grid grid-cols-[48px_1fr] gap-2.5 border-l-2 px-4 py-2.5",
                      tone.border,
                      highlightId === seg.id && "bg-brand-tint",
                    )}
                  >
                    <div className="pt-0.5 font-mono text-[11px] text-muted-foreground">
                      {seg.start != null ? formatDuration(seg.start) : "—"}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          tone.pill,
                        )}
                      >
                        {prettySpeaker(key)}
                      </span>
                      <p className="mt-1 text-[13.5px] leading-normal">
                        {seg.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <IntelPanel pending={pending} onEvidence={openEvidence} />
      </div>

      <EvidenceModal
        evidence={evidence}
        onClose={() => setEvidence(null)}
        onJump={jumpToTranscript}
      />
    </div>
  );
}

function IntelPanel({
  pending,
  onEvidence,
}: {
  pending: boolean;
  onEvidence: (segId: string, quote?: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Intel
        </h3>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            pending ? "text-warning" : "text-muted-foreground",
          )}
        >
          {pending ? "processing" : "shipped"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Run status
        </h4>
        <p className="mb-4 flex items-center gap-1.5 text-[13px] font-medium">
          <span
            className={cn(
              "size-[7px] rounded-full",
              pending ? "animate-pulse bg-warning" : "bg-success",
            )}
          />
          <span className={pending ? "text-warning" : undefined}>
            {pending ? "Processing" : DEMO_INTEL.runStatus}
          </span>
        </p>

        <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Summary
        </h4>
        <InsightCard
          bar="bg-success"
          title={DEMO_INTEL.summary.title}
          desc={DEMO_INTEL.summary.desc}
          segId={DEMO_INTEL.summary.segId}
          quote={DEMO_INTEL.summary.quote}
          onEvidence={onEvidence}
        />

        <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Objections
        </h4>
        <InsightCard
          bar="bg-danger"
          title={DEMO_INTEL.objection.title}
          desc={DEMO_INTEL.objection.desc}
          segId={DEMO_INTEL.objection.segId}
          quote={DEMO_INTEL.objection.quote}
          onEvidence={onEvidence}
        />

        <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Intent
        </h4>
        <InsightCard
          bar="bg-brand"
          title={DEMO_INTEL.intent.title}
          segId={DEMO_INTEL.intent.segId}
          quote={DEMO_INTEL.intent.quote}
          onEvidence={onEvidence}
        />

        <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Next steps
        </h4>
        <ul>
          {DEMO_INTEL.nextSteps.map((step) => (
            <li
              key={step.text}
              className="flex items-center gap-2 border-b border-border py-2 text-[12.5px] last:border-b-0"
            >
              <Circle className="size-3 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:text-brand"
                onClick={() => onEvidence(step.segId, step.quote)}
              >
                {step.text}
                <ArrowUpRight className="ml-0.5 inline size-3 text-brand" />
              </button>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
                {step.owner}
              </span>
            </li>
          ))}
        </ul>

        <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Follow-up email
        </h4>
        <div className="rounded-md bg-muted px-3 py-2.5">
          <p className="text-[12.5px] font-semibold">{DEMO_INTEL.email.subject}</p>
          <p className="mt-1 text-[12.5px] text-ink-soft">{DEMO_INTEL.email.body}</p>
        </div>
      </div>
    </section>
  );
}

function InsightCard({
  bar,
  title,
  desc,
  segId,
  quote,
  onEvidence,
}: {
  bar: string;
  title: string;
  desc?: string;
  segId: string;
  quote?: string;
  onEvidence: (segId: string, quote?: string) => void;
}) {
  return (
    <div className="flex gap-2.5">
      <div className={cn("w-0.5 shrink-0 self-stretch rounded-sm", bar)} />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="text-[12.5px] font-semibold">{title}</div>
        {desc ? (
          <p className="mt-0.5 text-xs leading-snug text-ink-soft">{desc}</p>
        ) : null}
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-0.5 font-mono text-[10.5px] text-brand hover:underline"
          onClick={() => onEvidence(segId, quote)}
        >
          <ArrowUpRight className="size-3" />
          {segId}
        </button>
      </div>
    </div>
  );
}

function EvidenceModal({
  evidence,
  onClose,
  onJump,
}: {
  evidence: Evidence | null;
  onClose: () => void;
  onJump: () => void;
}) {
  return (
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[360px]">
        <span
          aria-hidden
          className="pointer-events-none absolute top-3 left-3 size-2.5 border-t border-l border-muted-foreground/45"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 bottom-3 size-2.5 border-r border-b border-muted-foreground/45"
        />
        <DialogHeader>
          <DialogTitle className="font-mono text-[10.5px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
            Evidence
          </DialogTitle>
          <DialogDescription className="sr-only">
            {evidence
              ? `${evidence.speaker} at ${evidence.time}: ${evidence.quote}`
              : "Transcript evidence"}
          </DialogDescription>
        </DialogHeader>
        {evidence ? (
          <div>
            <div className="mb-2.5 flex justify-between font-mono text-xs text-ink-soft">
              <span>{evidence.speaker}</span>
              <span>{evidence.time}</span>
            </div>
            <p className="mb-1.5 text-[14.5px] leading-relaxed font-semibold">
              {evidence.quote}
            </p>
            <p className="mb-4 font-mono text-[10.5px] text-muted-foreground">
              {evidence.segId}
            </p>
            <Button
              type="button"
              className="w-full bg-brand text-white hover:bg-brand-hover"
              onClick={onJump}
            >
              Jump to transcript
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
