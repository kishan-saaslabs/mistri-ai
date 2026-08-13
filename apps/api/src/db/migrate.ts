import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/database.js";

const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");

const sql = await readFile(schemaPath, "utf8");
await pool.query(sql);
console.log("Database schema applied.");
await pool.end();
