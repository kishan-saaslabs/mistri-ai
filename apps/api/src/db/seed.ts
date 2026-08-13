import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";

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

const dealNames = ["Acme Corp", "Northwind", "Brightline"];

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

  await client.query("COMMIT");
  console.log("Seed data applied (organization, users, and deals).");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
