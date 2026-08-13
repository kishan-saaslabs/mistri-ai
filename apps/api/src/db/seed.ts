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

  for (const user of users) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [user.email],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      demoUserId = existing.rows[0]!.id;
      await client.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [demoUserId]);
      continue;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, org, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.email, passwordHash, user.name, user.org, "OWNER"],
    );
    demoUserId = inserted.rows[0]!.id;
  }

  for (const name of dealNames) {
    const existing = await client.query("SELECT id FROM deals WHERE name = $1 LIMIT 1", [name]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    await client.query(`INSERT INTO deals (name, created_by) VALUES ($1, $2)`, [name, demoUserId]);
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
  console.log("Seed data applied (users and deals).");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
