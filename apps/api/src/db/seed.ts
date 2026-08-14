import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { parseFile } from "music-metadata";
import { pool } from "../config/database.js";
import { mimeForAudio } from "../lib/audioFile.js";
import { newObjectKey, objectStorage, putFile } from "../services/objectStorage.js";

const BCRYPT_ROUNDS = 12;

const seedPassword = process.env.SEED_USER_PASSWORD?.trim();
if (!seedPassword || seedPassword.length < 10) {
  await pool.end();
  throw new Error(
    "SEED_USER_PASSWORD must be set in the environment (min 10 characters) before running db:seed.",
  );
}

const users = [
  {
    email: "demo@mistri.ai",
    name: "Demo User",
    org: "Mistri",
  },
];

const dealNames = ["Acme Corp", "Northwind", "Brightline", "Diego Herrera"];

const SEED_ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "seed-assets");

// Add the file to db/seed-assets/ (see the README there) and re-run
// `pnpm db:seed` to attach it as a sample call on the matching deal.
// Entries whose file isn't present yet are skipped, not failed. Duration is
// read from the file itself (see probeDurationSeconds), not hardcoded here.
const sampleCalls = [
  {
    filename: "8x8 Call 1 with AE 24 Feb 2024 Saturday, February 241 30 2 00am 4k [_06n44rT3so].mp3",
    label: "8x8 Call — AE (24 Feb 2024)",
    dealName: "Diego Herrera",
    // Full transcription (segments, full_text) read from this file and
    // inserted into the transcriptions table alongside the call. Optional —
    // omit to seed the call with no transcription.
    transcriptionFile: "8x8-call-transcription.json",
    // Extracted insights (summary, objections, etc.) tied to the
    // transcription above. Optional; ignored if transcriptionFile isn't set.
    insightsFile: "8x8-call-insights.json",
  },
  {
    filename: "Sample sales call.mp3",
    label: "Sample Sales Call",
    dealName: "Acme Corp",
  },
];

type SeedTranscription = {
  provider: string;
  model: string;
  status: string;
  language: string | null;
  duration_seconds: number | null;
  full_text: string | null;
  segments: unknown[];
  error: string | null;
};

type SeedInsights = {
  status: string;
  summary: unknown[];
  objections: unknown[];
  customer_wants: unknown[];
  next_steps: unknown[];
  follow_up_email: unknown;
  error: string | null;
};

async function probeDurationSeconds(assetPath: string): Promise<number> {
  try {
    const { format } = await parseFile(assetPath);
    return Math.round(format.duration ?? 0);
  } catch {
    return 0;
  }
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const passwordHash = await bcrypt.hash(seedPassword, BCRYPT_ROUNDS);
  let demoUserId: string | null = null;
  let organizationId: string | null = null;

  const existingOrg = await client.query<{ id: string }>(
    "SELECT id FROM organizations WHERE name = $1 LIMIT 1",
    ["Mistri"],
  );
  if (existingOrg.rowCount && existingOrg.rowCount > 0) {
    organizationId = existingOrg.rows[0]!.id;
  } else {
    const insertedOrg = await client.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      ["Mistri"],
    );
    organizationId = insertedOrg.rows[0]!.id;
  }

  if (!organizationId) {
    throw new Error("Could not create or load seed organization.");
  }

  const orgId = organizationId;

  for (const user of users) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [user.email],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      demoUserId = existing.rows[0]!.id;
      await client.query(
        `UPDATE users SET role = 'OWNER', organization_id = $2, org = $3 WHERE id = $1`,
        [demoUserId, orgId, user.org],
      );
      continue;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, org, organization_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [user.email, passwordHash, user.name, user.org, orgId, "OWNER"],
    );
    demoUserId = inserted.rows[0]!.id;
  }

  for (const name of dealNames) {
    const existing = await client.query("SELECT id FROM deals WHERE name = $1 LIMIT 1", [name]);
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query(`UPDATE deals SET organization_id = $2 WHERE name = $1 AND organization_id IS DISTINCT FROM $2`, [
        name,
        orgId,
      ]);
      continue;
    }

    await client.query(`INSERT INTO deals (name, created_by, organization_id) VALUES ($1, $2, $3)`, [
      name,
      demoUserId,
      orgId,
    ]);
  }

  if (demoUserId) {
    await client.query(
      `INSERT INTO user_deals (user_id, deal_id)
       SELECT $1, id FROM deals WHERE name = ANY($2::text[])
       ON CONFLICT (user_id, deal_id) DO NOTHING`,
      [demoUserId, dealNames],
    );
  }

  if (!objectStorage.isConfigured()) {
    console.log("Object storage (S3_*) is not configured — skipping sample call audio.");
  } else {
    await objectStorage.ensureReady();

    for (const sample of sampleCalls) {
      const assetPath = join(SEED_ASSETS_DIR, sample.filename);
      if (!existsSync(assetPath)) {
        console.log(
          `Skipping sample call "${sample.label}" — add apps/api/src/db/seed-assets/${sample.filename} and re-run pnpm db:seed.`,
        );
        continue;
      }

      let callId: string;
      const existingCall = await client.query<{ id: string }>(
        "SELECT id FROM calls WHERE label = $1 AND organization_id = $2 LIMIT 1",
        [sample.label, orgId],
      );
      if (existingCall.rowCount && existingCall.rowCount > 0) {
        callId = existingCall.rows[0]!.id;
      } else {
        const dealRow = await client.query<{ id: string }>(
          "SELECT id FROM deals WHERE name = $1 AND organization_id = $2 LIMIT 1",
          [sample.dealName, orgId],
        );
        const dealId = dealRow.rows[0]?.id ?? null;

        const durationSeconds = await probeDurationSeconds(assetPath);
        const objectKey = newObjectKey(orgId, sample.filename);
        await putFile(objectKey, assetPath, mimeForAudio(sample.filename));

        const insertedCall = await client.query<{ id: string }>(
          `INSERT INTO calls (organization_id, deal_id, uploaded_by, label, filename, duration_seconds, status, storage_path)
           VALUES ($1, $2, $3, $4, $5, $6, 'PYAI_SUCCESS', $7)
           RETURNING id`,
          [orgId, dealId, demoUserId, sample.label, sample.filename, durationSeconds, objectKey],
        );
        callId = insertedCall.rows[0]!.id;
        console.log(`Seeded sample call "${sample.label}".`);
      }

      if (!sample.transcriptionFile) {
        continue;
      }

      const transcriptionPath = join(SEED_ASSETS_DIR, sample.transcriptionFile);
      if (!existsSync(transcriptionPath)) {
        console.log(
          `Skipping transcription for "${sample.label}" — add apps/api/src/db/seed-assets/${sample.transcriptionFile} and re-run pnpm db:seed.`,
        );
        continue;
      }

      let transcriptionId: string;
      const existingTranscription = await client.query<{ id: string }>(
        "SELECT id FROM transcriptions WHERE call_id = $1 LIMIT 1",
        [callId],
      );
      if (existingTranscription.rowCount && existingTranscription.rowCount > 0) {
        transcriptionId = existingTranscription.rows[0]!.id;
      } else {
        const parsed = JSON.parse(readFileSync(transcriptionPath, "utf8")) as SeedTranscription;
        const insertedTranscription = await client.query<{ id: string }>(
          `INSERT INTO transcriptions (call_id, provider, model, status, language, duration_seconds, full_text, segments, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            callId,
            parsed.provider,
            parsed.model,
            parsed.status,
            parsed.language,
            parsed.duration_seconds,
            parsed.full_text,
            JSON.stringify(parsed.segments),
            parsed.error,
          ],
        );
        transcriptionId = insertedTranscription.rows[0]!.id;
        console.log(`Seeded transcription for "${sample.label}".`);
      }

      if (!sample.insightsFile) {
        continue;
      }

      const insightsPath = join(SEED_ASSETS_DIR, sample.insightsFile);
      if (!existsSync(insightsPath)) {
        console.log(
          `Skipping insights for "${sample.label}" — add apps/api/src/db/seed-assets/${sample.insightsFile} and re-run pnpm db:seed.`,
        );
        continue;
      }

      const existingInsights = await client.query(
        "SELECT id FROM call_insights WHERE transcription_id = $1 LIMIT 1",
        [transcriptionId],
      );
      if (existingInsights.rowCount && existingInsights.rowCount > 0) {
        continue;
      }

      const insights = JSON.parse(readFileSync(insightsPath, "utf8")) as SeedInsights;
      await client.query(
        `INSERT INTO call_insights (call_id, transcription_id, status, summary, objections, customer_wants, next_steps, follow_up_email, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          callId,
          transcriptionId,
          insights.status,
          JSON.stringify(insights.summary),
          JSON.stringify(insights.objections),
          JSON.stringify(insights.customer_wants),
          JSON.stringify(insights.next_steps),
          insights.follow_up_email ? JSON.stringify(insights.follow_up_email) : null,
          insights.error,
        ],
      );
      console.log(`Seeded insights for "${sample.label}".`);
    }
  }

  await client.query("COMMIT");
  console.log("Seed data applied (organization, users, deals, and sample calls).");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
