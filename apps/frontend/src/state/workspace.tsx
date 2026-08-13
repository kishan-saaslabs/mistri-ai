import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { answerAskQuestion } from "@/lib/ask";
import { SEED_CALLS, SEED_PROCESSING, SEED_REPS } from "@/lib/seed-data";
import type { AskMessage, CallRecord, Deal, ListFilter, ProcessingItem, Rep, Segment } from "@/types/domain";

type Evidence = {
  speaker: string;
  time: string;
  quote: string;
  source: string;
  segId: string;
  callId: string;
};

type WorkspaceValue = {
  reps: Record<string, Rep>;
  deals: Record<string, Deal>;
  calls: Record<string, CallRecord>;
  processing: ProcessingItem[];
  currentCallId: string;
  currentCall: CallRecord;
  listFilter: ListFilter;
  askHistory: AskMessage[];
  askContext: string | null;
  askBusy: boolean;
  evidence: Evidence | null;
  highlightSegId: string | null;
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
  createDeal: (name: string) => string | null;
  setListFilter: (filter: ListFilter) => void;
  selectCall: (id: string) => void;
  mapCallToDeal: (callId: string, dealId: string | null) => void;
  openEvidence: (segId: string, callId?: string) => void;
  closeEvidence: () => void;
  askAboutCall: (callId: string) => void;
  setAskContext: (id: string | null) => void;
  askQuestion: (text: string, options?: { clearContext?: boolean }) => void;
  queueUpload: (input: { label: string; filename: string; rep: string; dealId: string | null }) => void;
  filteredCallIds: string[];
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const TEMPLATES = ["strong", "risky", "lost"] as const;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [reps] = useState(SEED_REPS);
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const [calls, setCalls] = useState<Record<string, CallRecord>>(SEED_CALLS);
  const [processing, setProcessing] = useState<ProcessingItem[]>(
    SEED_PROCESSING.map((item) => ({ ...item, dealId: null })),
  );
  const [currentCallId, setCurrentCallId] = useState("strong");
  const [listFilter, setListFilterState] = useState<ListFilter>(null);
  const [askHistory, setAskHistory] = useState<AskMessage[]>([]);
  const [askContext, setAskContext] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [highlightSegId, setHighlightSegId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dealCounter, setDealCounter] = useState(0);
  const [uploadCounter, setUploadCounter] = useState(0);

  const currentCall = calls[currentCallId] ?? Object.values(calls)[0]!;

  const createDeal = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = `deal_${dealCounter + 1}`;
    setDealCounter((n) => n + 1);
    setDeals((prev) => ({ ...prev, [id]: { id, name: trimmed, createdAt: Date.now() } }));
    return id;
  }, [dealCounter]);

  const setListFilter = useCallback(
    (filter: ListFilter) => {
      setListFilterState((prev) => {
        if (prev && filter && JSON.stringify(prev) === JSON.stringify(filter)) {
          return null;
        }
        return filter;
      });
      void navigate("/calls");
    },
    [navigate],
  );

  const selectCall = useCallback((id: string) => {
    setCurrentCallId(id);
    setHighlightSegId(null);
  }, []);

  const mapCallToDeal = useCallback((callId: string, dealId: string | null) => {
    setCalls((prev) => {
      const call = prev[callId];
      if (!call) return prev;
      return { ...prev, [callId]: { ...call, dealId } };
    });
  }, []);

  const openEvidence = useCallback(
    (segId: string, callId?: string) => {
      const id = callId ?? currentCallId;
      const call = calls[id];
      const seg: Segment | undefined = call?.segments.find((item) => item.id === segId);
      if (!call || !seg) return;
      setEvidence({
        speaker: seg.speaker,
        time: seg.t,
        quote: `\u201C${seg.text}\u201D`,
        source: `${call.label} · ${seg.t}`,
        segId,
        callId: id,
      });
      if (!callId || callId === currentCallId) {
        setHighlightSegId(segId);
      }
    },
    [calls, currentCallId],
  );

  const closeEvidence = useCallback(() => setEvidence(null), []);

  const askAboutCall = useCallback(
    (callId: string) => {
      setAskContext(callId);
      void navigate("/ask");
    },
    [navigate],
  );

  const askQuestion = useCallback(
    (text: string, options?: { clearContext?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || askBusy) return;
      if (options?.clearContext) {
        setAskContext(null);
      }
      const contextAtAsk = options?.clearContext ? null : askContext;
      setAskHistory((prev) => [...prev, { role: "user", text: trimmed }]);
      setAskBusy(true);
      void navigate("/ask");
      window.setTimeout(() => {
        const answer = answerAskQuestion(trimmed, {
          askContext: contextAtAsk,
          calls,
          deals,
          reps,
        });
        setAskHistory((prev) => [...prev, { role: "bot", ...answer }]);
        setAskBusy(false);
      }, 900);
    },
    [askBusy, askContext, calls, deals, navigate, reps],
  );

  const queueUpload = useCallback(
    (input: { label: string; filename: string; rep: string; dealId: string | null }) => {
      const id = `upload_${uploadCounter + 1}`;
      setUploadCounter((n) => n + 1);
      setProcessing((prev) => [...prev, { id, label: input.label, rep: input.rep, sub: "Transcribing…", dealId: input.dealId }]);
      void navigate("/calls");
      window.setTimeout(() => {
        const templateKey = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]!;
        const template = SEED_CALLS[templateKey]!;
        setProcessing((prev) => prev.filter((item) => item.id !== id));
        setCalls((prev) => ({
          ...prev,
          [id]: {
            ...structuredClone(template),
            id,
            label: input.label,
            filename: input.filename,
            rep: input.rep,
            dealId: input.dealId,
          },
        }));
      }, 4500);
    },
    [navigate, uploadCounter],
  );

  const filteredCallIds = useMemo(() => {
    return Object.keys(calls).filter((id) => {
      const call = calls[id]!;
      if (!listFilter) return true;
      if (listFilter.type === "rep") return call.rep === listFilter.key;
      if (listFilter.type === "deal") return call.dealId === listFilter.id;
      if (listFilter.type === "unassigned") return !call.dealId;
      return true;
    });
  }, [calls, listFilter]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      reps,
      deals,
      calls,
      processing,
      currentCallId,
      currentCall,
      listFilter,
      askHistory,
      askContext,
      askBusy,
      evidence,
      highlightSegId,
      uploadOpen,
      setUploadOpen,
      createDeal,
      setListFilter,
      selectCall,
      mapCallToDeal,
      openEvidence,
      closeEvidence,
      askAboutCall,
      setAskContext,
      askQuestion,
      queueUpload,
      filteredCallIds,
    }),
    [
      askAboutCall,
      askBusy,
      askContext,
      askHistory,
      askQuestion,
      calls,
      closeEvidence,
      createDeal,
      currentCall,
      currentCallId,
      deals,
      evidence,
      filteredCallIds,
      highlightSegId,
      listFilter,
      mapCallToDeal,
      openEvidence,
      processing,
      queueUpload,
      reps,
      selectCall,
      setListFilter,
      uploadOpen,
    ],
  );

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
