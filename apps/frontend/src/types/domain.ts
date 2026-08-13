export type StatusColor = "success" | "warning" | "danger" | "neutral";

export type Rep = {
  slug: string;
  name: string;
  initials: string;
  role: string;
  callsThisMonth: number;
  avgHealth: number | null;
  atRisk: number;
};

export type Deal = {
  id: string;
  name: string;
  createdAt: number;
};

export type Segment = {
  id: string;
  t: string;
  who: string;
  speaker: string;
  text: string;
};

export type Insight = {
  title: string;
  desc: string;
  segId: string;
};

export type NextStep = {
  text: string;
  owner: string;
  done: boolean;
};

export type CallRecord = {
  id: string;
  dealId: string | null;
  label: string;
  rep: string;
  filename: string;
  duration: number;
  score: number | null;
  verdict: string;
  statusColor: StatusColor;
  intent: Array<{ plan: string; pct: number }>;
  segments: Segment[];
  signals: Insight[];
  risks: Insight[];
  nextSteps: NextStep[];
};

export type ProcessingItem = {
  id: string;
  label: string;
  rep: string;
  sub: string;
  dealId: string | null;
};

export type ListFilter =
  | null
  | { type: "rep"; key: string }
  | { type: "deal"; id: string }
  | { type: "unassigned" };

export type AskMessage =
  | { role: "user"; text: string }
  | {
      role: "bot";
      text: string;
      inlineCard?: { type: "deal" | "rep"; key: string };
      secondaryCard?: { type: "deal" | "rep"; key: string };
      multiRepCards?: string[];
    };
