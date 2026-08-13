import { pool } from "../config/database.js";
import type { CallAnalysis } from "../models/callModel.js";

const reps = [
  { slug: "sarah", name: "Sarah Chen", initials: "SC", role: "Account Executive" },
  { slug: "melissa", name: "Melissa Wren", initials: "MW", role: "Account Executive" },
  { slug: "rohit", name: "Rohit Malhotra", initials: "RM", role: "Account Executive" },
  { slug: "bob", name: "Bob Nguyen", initials: "BN", role: "SDR" },
];

type SeedCall = {
  slug: string;
  rep: string;
  label: string;
  filename: string;
  duration: number;
  score: number | null;
  verdict: string;
  statusColor: string;
  analysis: CallAnalysis;
};

const calls: SeedCall[] = [
  {
    slug: "strong",
    rep: "sarah",
    label: "Acme Corp — Renewal Call",
    filename: "acme-corp-renewal.mp3",
    duration: 34 * 60 + 22,
    score: 82,
    verdict: "Strong",
    statusColor: "success",
    analysis: {
      intent: [
        { plan: "Pro", pct: 91 },
        { plan: "Enterprise", pct: 61 },
        { plan: "Starter", pct: 8 },
      ],
      segments: [
        { id: "seg_1", t: "23:12", who: "Rep", speaker: "Rep", text: "So what are you weighing this against right now?" },
        { id: "seg_2", t: "23:29", who: "Customer", speaker: "Customer", text: "Honestly the pricing gave us pause. That's quite a bit higher than what we're paying today." },
        { id: "seg_3", t: "23:41", who: "Customer", speaker: "Customer", text: "But yeah, we're ready to move forward with the Pro plan." },
        { id: "seg_4", t: "24:03", who: "Rep", speaker: "Rep", text: "Great, I'll get the security docs over today so legal can start." },
        { id: "seg_5", t: "24:18", who: "Customer", speaker: "Customer", text: "Perfect, we'll review the proposal on our end and circle back Friday." },
      ],
      signals: [{ title: "Ready to move forward", desc: "Customer confirmed they're ready to move forward with the Pro plan.", segId: "seg_3" }],
      risks: [{ title: "Pricing objection", desc: "Customer said the price is higher than what they pay today.", segId: "seg_2" }],
      nextSteps: [
        { text: "Send security documentation", owner: "Rep", done: true },
        { text: "Review proposal", owner: "Customer", done: true },
        { text: "Follow up Friday", owner: "Rep", done: false },
      ],
    },
  },
  {
    slug: "risky",
    rep: "melissa",
    label: "Northwind — Discovery Call",
    filename: "northwind-call2.mp3",
    duration: 28 * 60 + 9,
    score: 47,
    verdict: "At risk",
    statusColor: "warning",
    analysis: {
      intent: [
        { plan: "Pro", pct: 44 },
        { plan: "Enterprise", pct: 22 },
        { plan: "Starter", pct: 35 },
      ],
      segments: [
        { id: "seg_1", t: "11:02", who: "Rep", speaker: "Rep", text: "Where does this sit against the other tools you're piloting?" },
        { id: "seg_2", t: "11:20", who: "Customer", speaker: "Customer", text: "We're also deep in a trial with a competitor, so it's close." },
        { id: "seg_3", t: "14:47", who: "Customer", speaker: "Customer", text: "I like it, but I don't actually own this budget line." },
        { id: "seg_4", t: "18:33", who: "Customer", speaker: "Customer", text: "If the trial goes well I'd want to loop in our VP of Sales before anything's signed." },
        { id: "seg_5", t: "21:05", who: "Rep", speaker: "Rep", text: "Understood. Let's get a trial scoped so you have something concrete to bring to her." },
      ],
      signals: [{ title: "Willing to run a trial", desc: "Customer is open to a scoped trial as a path toward a decision.", segId: "seg_5" }],
      risks: [
        { title: "Active competitor evaluation", desc: "Customer is running a parallel trial with a competing tool.", segId: "seg_2" },
        { title: "No confirmed decision maker", desc: "Customer doesn't own the budget and needs to loop in a VP.", segId: "seg_3" },
      ],
      nextSteps: [
        { text: "Scope a two-week trial", owner: "Rep", done: false },
        { text: "Get intro to VP of Sales", owner: "Rep", done: false },
      ],
    },
  },
  {
    slug: "lost",
    rep: "rohit",
    label: "Brightline — Final Call",
    filename: "brightline-final.mp3",
    duration: 19 * 60 + 41,
    score: 18,
    verdict: "Lost",
    statusColor: "danger",
    analysis: {
      intent: [
        { plan: "Pro", pct: 12 },
        { plan: "Enterprise", pct: 4 },
        { plan: "Starter", pct: 9 },
      ],
      segments: [
        { id: "seg_1", t: "04:10", who: "Rep", speaker: "Rep", text: "How are you feeling about moving forward this quarter?" },
        { id: "seg_2", t: "04:33", who: "Customer", speaker: "Customer", text: "I'll be straight with you, we signed with another vendor last week." },
        { id: "seg_3", t: "05:02", who: "Customer", speaker: "Customer", text: "It mostly came down to their onboarding timeline being shorter." },
      ],
      signals: [],
      risks: [
        { title: "Signed with a competitor", desc: "Customer confirmed they already signed with another vendor.", segId: "seg_2" },
        { title: "Lost on onboarding speed", desc: "Decision came down to a faster onboarding timeline elsewhere.", segId: "seg_3" },
      ],
      nextSteps: [
        { text: "Log loss reason: onboarding speed", owner: "Rep", done: true },
        { text: "Add to 6-month re-engagement list", owner: "Rep", done: false },
      ],
    },
  },
  {
    slug: "rescheduled",
    rep: "bob",
    label: "Simone Akinbode — Rescheduled",
    filename: "simone-akinbode-call.mp3",
    duration: 43,
    score: null,
    verdict: "Not enough signal",
    statusColor: "neutral",
    analysis: {
      intent: [],
      segments: [
        { id: "seg_1", t: "00:01", who: "Customer", speaker: "Simone Akinbode", text: "Hello?" },
        { id: "seg_2", t: "00:02", who: "Rep", speaker: "Devanshi Pruthi", text: "Hi, is this Simone?" },
        { id: "seg_5", t: "00:12", who: "Customer", speaker: "Simone Akinbode", text: "I'm just heading into a meeting now." },
        { id: "seg_7", t: "00:20", who: "Customer", speaker: "Simone Akinbode", text: "Call me back in about three hours." },
      ],
      signals: [],
      risks: [{ title: "Call cut short before any discussion", desc: "Customer was heading into a meeting. No product or pricing was discussed.", segId: "seg_5" }],
      nextSteps: [{ text: "Call back in about three hours", owner: "Rep", done: false }],
    },
  },
];

const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const rep of reps) {
    await client.query(
      `INSERT INTO reps (slug, name, initials, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, initials = EXCLUDED.initials, role = EXCLUDED.role`,
      [rep.slug, rep.name, rep.initials, rep.role],
    );
  }

  const repRows = await client.query<{ id: string; slug: string }>("SELECT id, slug FROM reps");
  const repIds = new Map(repRows.rows.map((row) => [row.slug, row.id]));

  for (const call of calls) {
    const repId = repIds.get(call.rep);
    if (!repId) {
      throw new Error(`Missing seeded rep: ${call.rep}`);
    }

    const existing = await client.query("SELECT id FROM calls WHERE filename = $1 LIMIT 1", [call.filename]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    await client.query(
      `INSERT INTO calls (rep_id, label, filename, duration_seconds, score, verdict, status_color, status, analysis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8::jsonb)`,
      [repId, call.label, call.filename, call.duration, call.score, call.verdict, call.statusColor, JSON.stringify(call.analysis)],
    );
  }

  await client.query("COMMIT");
  console.log("Seed data applied (demo calls and reps). Register a user via POST /api/auth/register.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
