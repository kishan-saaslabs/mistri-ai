import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Circle,
  Sparkles,
  FileDown,
  Pause,
  Play,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { MorphIn, SkeletonLine } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/format";
import {
  callsApi,
  isFailedStatus,
  isPendingStatus,
  type Call,
  type CallDetail,
  type CallInsight,
  type InsightEvidence,
  type TranscriptSegment,
  type Transcription,
} from "@/lib/api";
import { queryErrorMessage, queryKeys } from "@/lib/query";
import { motionTransition, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { DealsOutletContext } from "@/components/deals/DealsLayout";

const SPEAKER_TONES = [
  { border: "border-l-brand", pill: "bg-brand-tint text-brand" },
  { border: "border-l-warning", pill: "bg-warning-tint text-warning" },
  { border: "border-l-success", pill: "bg-success-tint text-success" },
  { border: "border-l-danger", pill: "bg-danger-tint text-danger" },
] as const;

const POLL_MS = 5_000;

function isPending(detail: CallDetail) {
  return (
    isPendingStatus(detail.call.status) ||
    detail.transcriptions.some((row) => isPendingStatus(row.status))
  );
}

function latestTranscription(rows: Transcription[]) {
  return rows[0] ?? null;
}

function canFetchInsights(row: Transcription | null) {
  if (!row) return false;
  return (
    row.status === "PYAI_SUCCESS" ||
    row.status === "LLM_TRANSCRIBING" ||
    row.status === "LLM_SUCCESS" ||
    row.status === "LLM_FAILED"
  );
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

function displaySpeaker(seg: TranscriptSegment) {
  const named = seg.speakerName?.trim();
  if (named) return named;
  return prettySpeaker(speakerKey(seg.speaker));
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
    const key = displaySpeaker(seg);
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
  segments: TranscriptSegment[]
): TranscriptSegment | undefined {
  const byId = segments.find((seg) => seg.id === segId);
  if (byId) return byId;
  const n = Number(segId.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return segments[n - 1];
}

function playbackSrc(call: Call) {
  const hosted = call.fileUrl ?? "";
  if (/\/api\/calls\/[^/?]+\/(?:file|audio)(?:\?|$)/.test(hosted)) {
    return callsApi.audioUrl(call.id);
  }
  const url = (call.source_url ?? call.fileUrl)?.trim() ?? "";
  return /^https?:\/\//i.test(url) ? url : null;
}

function segmentAtTime(segments: TranscriptSegment[], time: number) {
  let current: TranscriptSegment | undefined;
  let best = -Infinity;
  for (const seg of segments) {
    if (seg.start == null || seg.start > time) continue;
    if (seg.end != null && time >= seg.end) continue;
    if (seg.start >= best) {
      best = seg.start;
      current = seg;
    }
  }
  return current;
}

function segmentEnd(seg: TranscriptSegment, segments: TranscriptSegment[]) {
  if (seg.end != null) return seg.end;
  const index = segments.findIndex((row) => row.id === seg.id);
  return index >= 0 ? segments[index + 1]?.start ?? null : null;
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

type ExportScope = "transcript" | "intel" | "both";
type ExportFormat = "markdown" | "json";

function transcriptLines(segments: TranscriptSegment[]) {
  return segments.map((seg) => ({
    Speaker: displaySpeaker(seg),
    time: seg.start != null ? formatDuration(seg.start) : "—",
    text: seg.text,
  }));
}

function firstEvidence(evidence: InsightEvidence[]) {
  return evidence[0];
}

function insightStatusLabel(
  insights: CallInsight | null | undefined,
  callPending: boolean,
) {
  if (insights?.status === "FAILED") return "Failed";
  if (callPending || insights == null || insights.status === "PROCESSING") {
    return "Processing";
  }
  return "Shipped";
}

function intelExport(
  insights: CallInsight | null | undefined,
  callPending: boolean,
) {
  return {
    "Run status": insightStatusLabel(insights, callPending),
    Summary: (insights?.summary ?? []).map((item) => ({
      title: item.title,
      description: item.text,
      segment: firstEvidence(item.evidence)?.segmentId ?? "—",
    })),
    Objections: (insights?.objections ?? []).map((item) => ({
      title: item.title,
      description: item.text,
      segment: firstEvidence(item.evidence)?.segmentId ?? "—",
    })),
    Intent: (insights?.customer_wants ?? []).map((item) => ({
      title: item.label,
      confidence: item.confidence,
      segment: firstEvidence(item.evidence)?.segmentId ?? "—",
    })),
    "Next steps": (insights?.next_steps ?? []).map((item) => ({
      text: item.text,
      owner: item.owner,
      segment: firstEvidence(item.evidence)?.segmentId ?? "—",
    })),
    "Follow-up email": insights?.follow_up_email
      ? {
          subject: insights.follow_up_email.subject,
          body: insights.follow_up_email.body,
        }
      : null,
  };
}

function toExportJson(
  scope: ExportScope,
  segments: TranscriptSegment[],
  insights: CallInsight | null | undefined,
  callPending: boolean,
) {
  const out: Record<string, unknown> = {};
  if (scope === "transcript" || scope === "both") {
    out.Transcript = transcriptLines(segments);
  }
  if (scope === "intel" || scope === "both") {
    out.Intel = intelExport(insights, callPending);
  }
  return out;
}

function toExportMarkdown(
  title: string,
  scope: ExportScope,
  segments: TranscriptSegment[],
  insights: CallInsight | null | undefined,
  callPending: boolean,
) {
  const lines = [`# ${title}`, ""];
  if (scope === "transcript" || scope === "both") {
    lines.push("## Transcript", "");
    const rows = transcriptLines(segments);
    if (rows.length === 0) {
      lines.push("_No transcript._", "");
    } else {
      for (const row of rows) {
        lines.push(`**${row.Speaker}** · ${row.time}`, row.text, "");
      }
    }
  }
  if (scope === "intel" || scope === "both") {
    const intel = intelExport(insights, callPending);
    lines.push("## Intel", "");
    lines.push("### Run status", "", intel["Run status"], "");
    lines.push("### Summary", "");
    if (intel.Summary.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const item of intel.Summary) {
        lines.push(`**${item.title}**`, "", item.description, "", item.segment, "");
      }
    }
    lines.push("### Objections", "");
    if (intel.Objections.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const item of intel.Objections) {
        lines.push(`**${item.title}**`, "", item.description, "", item.segment, "");
      }
    }
    lines.push("### Intent", "");
    if (intel.Intent.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const item of intel.Intent) {
        lines.push(`**${item.title}** (${item.confidence})`, "", item.segment, "");
      }
    }
    lines.push("### Next steps", "");
    if (intel["Next steps"].length === 0) {
      lines.push("_None._", "");
    } else {
      for (const step of intel["Next steps"]) {
        lines.push(`- ${step.text} (${step.owner})`);
      }
      lines.push("");
    }
    lines.push("### Follow-up email", "");
    if (!intel["Follow-up email"]) {
      lines.push("_None._", "");
    } else {
      lines.push(
        `**${intel["Follow-up email"].subject}**`,
        "",
        intel["Follow-up email"].body,
        "",
      );
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function CallDetailView() {
  const { id = "" } = useParams();
  const { setActiveDealId } = useOutletContext<DealsOutletContext>();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [seek, setSeek] = useState<{
    at: number;
    until: number | null;
    n: number;
  } | null>(null);

  const callQuery = useQuery({
    queryKey: queryKeys.call(id),
    queryFn: () => callsApi.get(id),
    enabled: Boolean(id),
    refetchInterval: (q) =>
      q.state.data && isPending(q.state.data) ? POLL_MS : false,
  });
  const data = callQuery.data ?? null;
  const loading = callQuery.isPending;
  const error = callQuery.error ? queryErrorMessage(callQuery.error) : null;

  useEffect(() => {
    setActiveDealId(data?.call.deal_id ?? null);
    return () => setActiveDealId(null);
  }, [data?.call.deal_id, setActiveDealId]);

  const pending = data ? isPending(data) : false;

  const transcription = data ? latestTranscription(data.transcriptions) : null;
  const transcriptionId = transcription?.id;
  const insightsReady = canFetchInsights(transcription);
  const insightsQuery = useQuery({
    queryKey: queryKeys.callInsights(id, transcriptionId ?? ""),
    queryFn: () => callsApi.insights(id),
    enabled: Boolean(id) && insightsReady,
    refetchInterval: (q) => {
      if (!insightsReady) return false;
      const row = q.state.data;
      if (row === undefined) return false;
      if (row == null || row.status === "PROCESSING") return POLL_MS;
      return false;
    },
  });
  const insights = insightsQuery.data;
  const insightsLoading = insightsReady && insightsQuery.isPending;
  const insightsError = insightsQuery.error
    ? queryErrorMessage(insightsQuery.error)
    : null;
  const segments = useMemo(
    () => visibleSegments(transcription),
    [transcription]
  );
  const speakerKeys = useMemo(() => uniqueSpeakerKeys(segments), [segments]);
  const activeId = activePlayId ?? highlightId;
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    setActivePlayId(null);
    setHighlightId(null);
    setSeek(null);
  }, [id]);

  useEffect(() => {
    if (!activePlayId) return;
    const row = document.getElementById(`row-${activePlayId}`);
    const list = listRef.current;
    if (!row || !list) return;
    const rowRect = row.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
      row.scrollIntoView({
        block: "nearest",
        behavior: reduce ? "instant" : "smooth",
      });
    }
  }, [activePlayId, reduce]);

  function requestSeek(at: number, until: number | null = null) {
    setSeek((prev) => ({ at, until, n: (prev?.n ?? 0) + 1 }));
  }

  function openEvidence(segId: string, fallbackQuote?: string) {
    const target = resolveSeg(segId, segments);
    const fromTranscript = target?.text.trim();
    const snippet = fallbackQuote?.trim();
    const quote =
      fromTranscript &&
      snippet &&
      fromTranscript.toLowerCase().includes(snippet.toLowerCase())
        ? snippet
        : fromTranscript || snippet || "—";
    setEvidence({
      segId,
      speaker: target ? displaySpeaker(target) : "speaker_1",
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
    const target = segments.find((seg) => seg.id === targetId);
    if (target?.start != null) {
      requestSeek(target.start, segmentEnd(target, segments));
    }
  }

  if (loading) {
    return <CallDetailSkeleton />;
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
            onClick={() => void callQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { call } = data;
  const duration = transcription?.duration_seconds ?? call.duration_seconds;
  const audioSrc = playbackSrc(call);
  const failed =
    isFailedStatus(call.status) ||
    (transcription != null && isFailedStatus(transcription.status));
  const backTo = call.deal_id ? `/deals/${call.deal_id}` : "/deals";
  const backLabel = call.deal_id ? "Back to deal" : "All deals";
  const fileBase = slugify(call.label);

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
              {segments.length === 1 ? "" : "s"} ({speakerKeys.length} speaker
              {speakerKeys.length === 1 ? "" : "s"})
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" data-icon="inline-start">
            <Link
              to="/ask/new"
              state={{
                attach: {
                  type: "call" as const,
                  id: call.id,
                  name: call.label,
                },
              }}
            >
              <Sparkles className="size-3.5" />
              Ask Mistri
            </Link>
          </Button>
          <ExportMenu
            format="markdown"
            fileBase={fileBase}
            callLabel={call.label}
            segments={segments}
            insights={insights}
            callPending={pending}
          />
          <ExportMenu
            format="json"
            fileBase={fileBase}
            callLabel={call.label}
            segments={segments}
            insights={insights}
            callPending={pending}
          />
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
                pending ? "text-warning" : "text-muted-foreground"
              )}
            >
              {pending
                ? "processing"
                : `${segments.length} line${segments.length === 1 ? "" : "s"}`}
            </span>
          </header>
          <div
            ref={listRef}
            className="relative min-h-0 flex-1 overflow-y-auto"
          >
            {pending && segments.length === 0 ? (
              <div className="min-h-[220px]">
                {Array.from({ length: 6 }, (_, i) => (
                  <TranscriptRowSkeleton key={i} />
                ))}
              </div>
            ) : failed && segments.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-4 text-center">
                <p className="text-[13px] font-medium">Transcription failed</p>
                <p className="mt-1 max-w-[42ch] text-[12.5px] text-muted-foreground">
                  {transcription?.error ||
                    "The recording could not be transcribed."}
                </p>
              </div>
            ) : segments.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4">
                <p className="text-[13px] text-muted-foreground">
                  No transcript yet.
                </p>
              </div>
            ) : (
              <MorphIn>
                {segments.map((seg) => {
                  const name = displaySpeaker(seg);
                  const tone = toneFor(name, speakerKeys);
                  return (
                    <button
                      key={seg.id}
                      id={`row-${seg.id}`}
                      type="button"
                      onClick={() => {
                        setHighlightId(seg.id);
                        if (seg.start != null) {
                          requestSeek(seg.start, segmentEnd(seg, segments));
                        }
                      }}
                      className={cn(
                        "relative grid w-full grid-cols-[48px_1fr] gap-2.5 border-l-2 px-4 py-2.5 text-left",
                        tone.border
                      )}
                    >
                      {activeId === seg.id ? (
                        <motion.span
                          layoutId={`transcript-active-${id}`}
                          className="absolute inset-0 bg-brand-tint"
                          transition={motionTransition(
                            reduce,
                            springs.highlight
                          )}
                        />
                      ) : null}
                      <div className="relative z-1 pt-0.5 font-mono text-[11px] text-muted-foreground">
                        {seg.start != null ? formatDuration(seg.start) : "—"}
                      </div>
                      <div className="relative z-1">
                        <span
                          className={cn(
                            "mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                            tone.pill
                          )}
                        >
                          {name}
                        </span>
                        <p className="mt-1 text-[13.5px] leading-normal">
                          {seg.text}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </MorphIn>
            )}
          </div>
          {audioSrc ? (
            <TranscriptPlayer
              src={audioSrc}
              duration={duration}
              segments={segments}
              seek={seek}
              onActiveId={setActivePlayId}
            />
          ) : null}
        </section>

        <IntelPanel
          insights={insights}
          loading={insightsLoading || (pending && !transcriptionId)}
          callPending={pending}
          error={insightsError}
          onEvidence={openEvidence}
        />
      </div>

      <EvidenceModal
        evidence={evidence}
        onClose={() => setEvidence(null)}
        onJump={jumpToTranscript}
      />
    </div>
  );
}

function TranscriptRowSkeleton() {
  return (
    <div className="grid grid-cols-[48px_1fr] gap-2.5 border-l-2 border-transparent px-4 py-2.5">
      <div className="pt-0.5 font-mono text-[11px]">
        <SkeletonLine className="w-8" />
      </div>
      <div>
        <span className="mb-1 inline-flex animate-pulse rounded-full bg-muted px-2 py-0.5 text-[11px] leading-none font-medium text-transparent">
          Speaker 1
        </span>
        <p className="mt-1 text-[13.5px] leading-normal">
          <SkeletonLine className="w-full" />
        </p>
        <p className="text-[13.5px] leading-normal">
          <SkeletonLine className="w-[78%]" />
        </p>
      </div>
    </div>
  );
}

function CallDetailSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-7 pt-4 pb-6">
      <div className="mb-3 text-[12.5px]">
        <SkeletonLine className="w-24" />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">
            <SkeletonLine className="w-56" />
          </h1>
          <div className="mt-1.5">
            <p className="font-mono text-[11.5px]">
              <SkeletonLine className="w-72" />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 w-[118px] animate-pulse rounded-lg border border-border bg-muted" />
          <span className="inline-flex h-7 w-[86px] animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Transcript
            </h3>
            <span className="font-mono text-[10.5px]">
              <SkeletonLine className="w-12" />
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <TranscriptRowSkeleton key={i} />
            ))}
          </div>
        </section>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Intel
            </h3>
            <span className="font-mono text-[10.5px]">
              <SkeletonLine className="w-12" />
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Run status
            </h4>
            <p className="mb-4 flex items-center gap-1.5 text-[13px] font-medium">
              <span className="size-[7px] animate-pulse rounded-full bg-muted" />
              <SkeletonLine className="w-20" />
            </p>
            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Summary
            </h4>
            <div className="mb-4 flex gap-2.5">
              <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
              <div className="min-w-0 flex-1 py-0.5">
                <div className="text-[12.5px] font-semibold">
                  <SkeletonLine className="w-[70%]" />
                </div>
                <p className="mt-0.5 text-xs leading-snug">
                  <SkeletonLine className="w-full" />
                </p>
              </div>
            </div>
            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Objections
            </h4>
            <div className="mb-4 flex gap-2.5">
              <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
              <div className="min-w-0 flex-1 py-0.5">
                <div className="text-[12.5px] font-semibold">
                  <SkeletonLine className="w-[55%]" />
                </div>
                <p className="mt-0.5 text-xs leading-snug">
                  <SkeletonLine className="w-[90%]" />
                </p>
              </div>
            </div>
            <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Intent
            </h4>
            <div className="flex gap-2.5">
              <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
              <div className="min-w-0 flex-1 py-0.5">
                <div className="text-[12.5px] font-semibold">
                  <SkeletonLine className="w-24" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function IntelPanel({
  insights,
  loading,
  callPending,
  error,
  onEvidence,
}: {
  insights: CallInsight | null | undefined;
  loading: boolean;
  callPending: boolean;
  error: string | null;
  onEvidence: (segId: string, quote?: string) => void;
}) {
  const status = insightStatusLabel(insights, callPending || loading);
  const processing = status === "Processing";
  const failed = status === "Failed";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Intel
        </h3>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            processing && "text-warning",
            failed && "text-danger",
            !processing && !failed && "text-muted-foreground",
          )}
        >
          {processing ? "processing" : failed ? "failed" : "shipped"}
        </span>
      </header>
      {processing ? (
        <IntelBodySkeleton />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Run status
          </h4>
          <p className="mb-4 flex items-center gap-1.5 text-[13px] font-medium">
            <span
              className={cn(
                "size-[7px] rounded-full",
                failed ? "bg-danger" : "bg-success",
              )}
            />
            <span className={failed ? "text-danger" : undefined}>{status}</span>
          </p>
          {failed ? (
            <p className="mb-4 text-[12.5px] text-muted-foreground">
              {insights?.error || error || "Insights could not be generated."}
            </p>
          ) : null}

          <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Summary
          </h4>
          {(insights?.summary ?? []).length === 0 ? (
            <EmptyIntel />
          ) : (
            <div className="space-y-3">
              {insights!.summary.map((item) => {
                const ev = firstEvidence(item.evidence);
                return (
                  <InsightCard
                    key={`${item.title}-${ev?.segmentId ?? ""}`}
                    bar="bg-success"
                    title={item.title}
                    desc={item.text}
                    segId={ev?.segmentId}
                    quote={ev?.quote}
                    onEvidence={onEvidence}
                  />
                );
              })}
            </div>
          )}

          <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Objections
          </h4>
          {(insights?.objections ?? []).length === 0 ? (
            <EmptyIntel />
          ) : (
            <div className="space-y-3">
              {insights!.objections.map((item) => {
                const ev = firstEvidence(item.evidence);
                return (
                  <InsightCard
                    key={`${item.title}-${ev?.segmentId ?? ""}`}
                    bar="bg-danger"
                    title={item.title}
                    desc={item.text}
                    segId={ev?.segmentId}
                    quote={ev?.quote}
                    onEvidence={onEvidence}
                  />
                );
              })}
            </div>
          )}

          <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Intent
          </h4>
          {(insights?.customer_wants ?? []).length === 0 ? (
            <EmptyIntel />
          ) : (
            <div className="space-y-3">
              {insights!.customer_wants.map((item) => {
                const ev = firstEvidence(item.evidence);
                return (
                  <InsightCard
                    key={`${item.label}-${ev?.segmentId ?? ""}`}
                    bar="bg-brand"
                    title={item.label}
                    desc={item.confidence}
                    segId={ev?.segmentId}
                    quote={ev?.quote}
                    onEvidence={onEvidence}
                  />
                );
              })}
            </div>
          )}

          <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Next steps
          </h4>
          {(insights?.next_steps ?? []).length === 0 ? (
            <EmptyIntel />
          ) : (
            <ul>
              {insights!.next_steps.map((step) => {
                const ev = firstEvidence(step.evidence);
                return (
                  <li
                    key={`${step.text}-${ev?.segmentId ?? ""}`}
                    className="flex items-center gap-2 border-b border-border py-2 text-[12.5px] last:border-b-0"
                  >
                    <Circle className="size-3 shrink-0 text-muted-foreground" />
                    {ev ? (
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left hover:text-brand"
                        onClick={() => onEvidence(ev.segmentId, ev.quote)}
                      >
                        {step.text}
                        <ArrowUpRight className="ml-0.5 inline size-3 text-brand" />
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1">{step.text}</span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
                      {step.owner}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <h4 className="mt-4 mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Follow-up email
          </h4>
          {insights?.follow_up_email ? (
            <div className="rounded-md bg-muted px-3 py-2.5">
              <p className="text-[12.5px] font-semibold">
                {insights.follow_up_email.subject}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-soft">
                {insights.follow_up_email.body}
              </p>
            </div>
          ) : (
            <EmptyIntel />
          )}
        </div>
      )}
    </section>
  );
}

function EmptyIntel() {
  return <p className="text-[12.5px] text-muted-foreground">None yet.</p>;
}

function IntelBodySkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-4">
      <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Run status
      </h4>
      <p className="mb-4 flex items-center gap-1.5 text-[13px] font-medium">
        <span className="size-[7px] animate-pulse rounded-full bg-muted" />
        <SkeletonLine className="w-20" />
      </p>
      <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Summary
      </h4>
      <div className="mb-4 flex gap-2.5">
        <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="text-[12.5px] font-semibold">
            <SkeletonLine className="w-[70%]" />
          </div>
          <p className="mt-0.5 text-xs leading-snug">
            <SkeletonLine className="w-full" />
          </p>
        </div>
      </div>
      <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Objections
      </h4>
      <div className="mb-4 flex gap-2.5">
        <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="text-[12.5px] font-semibold">
            <SkeletonLine className="w-[55%]" />
          </div>
          <p className="mt-0.5 text-xs leading-snug">
            <SkeletonLine className="w-[90%]" />
          </p>
        </div>
      </div>
      <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Intent
      </h4>
      <div className="flex gap-2.5">
        <div className="w-0.5 shrink-0 self-stretch animate-pulse rounded-sm bg-muted" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="text-[12.5px] font-semibold">
            <SkeletonLine className="w-24" />
          </div>
        </div>
      </div>
    </div>
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
  segId?: string;
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
        {segId ? (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-0.5 font-mono text-[10.5px] text-brand hover:underline"
            onClick={() => onEvidence(segId, quote)}
          >
            <ArrowUpRight className="size-3" />
            {segId}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const EXPORT_SCOPES: { id: ExportScope; label: string }[] = [
  { id: "transcript", label: "Transcript" },
  { id: "intel", label: "Intel" },
  { id: "both", label: "Both" },
];

function ExportMenu({
  format,
  fileBase,
  callLabel,
  segments,
  insights,
  callPending,
}: {
  format: ExportFormat;
  fileBase: string;
  callLabel: string;
  segments: TranscriptSegment[];
  insights: CallInsight | null | undefined;
  callPending: boolean;
}) {
  function exportScope(scope: ExportScope) {
    if (format === "json") {
      downloadText(
        `${fileBase}.json`,
        JSON.stringify(
          toExportJson(scope, segments, insights, callPending),
          null,
          2,
        ),
        "application/json",
      );
      return;
    }
    downloadText(
      `${fileBase}.md`,
      toExportMarkdown(callLabel, scope, segments, insights, callPending),
      "text/markdown;charset=utf-8",
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-icon="inline-start"
        >
          <FileDown className="size-3.5" />
          {format === "json" ? "JSON" : "Markdown"}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {EXPORT_SCOPES.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => exportScope(item.id)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <Dialog
      open={Boolean(evidence)}
      onOpenChange={(open) => !open && onClose()}
    >
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

function TranscriptPlayer({
  src,
  duration,
  segments,
  seek,
  onActiveId,
}: {
  src: string;
  duration: number;
  segments: TranscriptSegment[];
  seek: { at: number; until: number | null; n: number } | null;
  onActiveId: (id: string | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastId = useRef<string | null>(null);
  const clipUntil = useRef<number | null>(null);
  const segmentsRef = useRef(segments);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playheadSpring, setPlayheadSpring] = useState(false);
  const reduce = useReducedMotion();
  segmentsRef.current = segments;

  const total = mediaDuration || duration || 0;
  const pct = total ? Math.min(100, (cursor / total) * 100) : 0;

  function pulsePlayhead() {
    if (reduce) return;
    setPlayheadSpring(true);
    window.setTimeout(() => setPlayheadSpring(false), 420);
  }

  function emitActive(time: number) {
    const next = segmentAtTime(segmentsRef.current, time)?.id ?? null;
    if (next === lastId.current) return;
    lastId.current = next;
    onActiveId(next);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    lastId.current = null;
    clipUntil.current = null;
    setPlaying(false);
    setCursor(0);
    setMediaDuration(0);
    onActiveId(null);
  }, [src, onActiveId]);

  useEffect(() => {
    if (!seek) return;
    const audio = audioRef.current;
    if (!audio) return;
    clipUntil.current = seek.until;
    audio.currentTime = seek.at;
    setCursor(seek.at);
    const next = segmentAtTime(segmentsRef.current, seek.at)?.id ?? null;
    if (next !== lastId.current) {
      lastId.current = next;
      onActiveId(next);
    }
    if (!reduce) {
      setPlayheadSpring(true);
      const id = window.setTimeout(() => setPlayheadSpring(false), 420);
      void audio.play();
      return () => window.clearTimeout(id);
    }
    void audio.play();
  }, [seek, onActiveId, reduce]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else {
      clipUntil.current = null;
      void audio.play();
    }
  }

  function seekBar(event: MouseEvent<HTMLButtonElement>) {
    if (!total) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );
    const at = next * total;
    clipUntil.current = null;
    const audio = audioRef.current;
    if (audio) audio.currentTime = at;
    setCursor(at);
    emitActive(at);
    pulsePlayhead();
  }

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border px-4 py-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="use-credentials"
        onPlay={() => {
          setPlaying(true);
          emitActive(audioRef.current?.currentTime ?? 0);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          lastId.current = null;
          onActiveId(null);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration)) {
            setMediaDuration(audio.duration);
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          const t = audio?.currentTime ?? 0;
          const stop = clipUntil.current;
          if (audio && stop != null && t >= stop) {
            clipUntil.current = null;
            audio.pause();
            audio.currentTime = stop;
            setCursor(stop);
            return;
          }
          setCursor(t);
          emitActive(t);
        }}
      />
      <motion.button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border hover:border-brand hover:text-brand"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={motionTransition(reduce, springs.snappy)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={playing ? "pause" : "play"}
            className="flex"
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            transition={motionTransition(reduce, springs.snappy)}
          >
            {playing ? (
              <Pause className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <button
        type="button"
        className="relative h-7 flex-1 cursor-pointer"
        onClick={seekBar}
        aria-label="Seek"
      >
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-sm bg-border">
          <motion.span
            className="absolute inset-y-0 left-0 w-full origin-left rounded-sm bg-brand"
            animate={{ scaleX: pct / 100 }}
            transition={
              playheadSpring
                ? motionTransition(reduce, springs.snappy)
                : { duration: 0 }
            }
          />
        </span>
      </button>
      <span className="min-w-[88px] shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">
        {formatDuration(cursor)} / {formatDuration(total)}
      </span>
    </div>
  );
}
