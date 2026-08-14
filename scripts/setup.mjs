#!/usr/bin/env node
/**
 * One-command local setup after `pnpm install`.
 * Does not print secrets. Does not overwrite non-empty .env values.
 */
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");

function run(command, args, { capture = false, silent = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: capture || silent ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
      shell: false,
    });
    let output = "";
    if (capture || silent) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (!silent) process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
        if (!silent) process.stderr.write(chunk);
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(output);
        return;
      }
      const error = new Error(`${command} ${args.join(" ")} exited ${code}`);
      error.output = output;
      error.code = code;
      reject(error);
    });
  });
}

function envValue(contents, key) {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function setEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }
  return `${contents.trimEnd()}\n${line}\n`;
}

function needsSecret(value) {
  return value.length === 0;
}

async function ensureEnv() {
  try {
    await readFile(envPath);
  } catch {
    await copyFile(examplePath, envPath);
    console.log("Created .env from .env.example");
  }

  let contents = await readFile(envPath, "utf8");
  const generated = [];

  const user = envValue(contents, "POSTGRES_USER") || "mistri";
  const db = envValue(contents, "POSTGRES_DB") || "mistri";
  const pgPort = envValue(contents, "POSTGRES_PORT") || "5432";
  let password = envValue(contents, "POSTGRES_PASSWORD");
  if (needsSecret(password)) {
    password = randomBytes(24).toString("hex");
    contents = setEnv(contents, "POSTGRES_PASSWORD", password);
    generated.push("POSTGRES_PASSWORD");
  }

  let databaseUrl = envValue(contents, "DATABASE_URL");
  const placeholder =
    !databaseUrl ||
    databaseUrl.includes("USER:PASSWORD") ||
    databaseUrl.includes("://USER:") ||
    /postgres(?:ql)?:\/\/[^:]+:@/.test(databaseUrl);
  if (placeholder) {
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);
    contents = setEnv(
      contents,
      "DATABASE_URL",
      `postgres://${encodedUser}:${encodedPassword}@localhost:${pgPort}/${db}`,
    );
    generated.push("DATABASE_URL");
  }

  if (needsSecret(envValue(contents, "JWT_SECRET"))) {
    contents = setEnv(contents, "JWT_SECRET", randomBytes(48).toString("base64url"));
    generated.push("JWT_SECRET");
  }

  if (needsSecret(envValue(contents, "SEED_USER_PASSWORD"))) {
    contents = setEnv(contents, "SEED_USER_PASSWORD", randomBytes(12).toString("hex"));
    generated.push("SEED_USER_PASSWORD");
  }

  const redisPort = envValue(contents, "REDIS_PORT") || "6379";
  if (needsSecret(envValue(contents, "REDIS_PORT"))) {
    contents = setEnv(contents, "REDIS_PORT", redisPort);
  }
  if (needsSecret(envValue(contents, "REDIS_URL"))) {
    contents = setEnv(contents, "REDIS_URL", `redis://localhost:${redisPort}`);
    generated.push("REDIS_URL");
  }

  if (needsSecret(envValue(contents, "S3_ACCESS_KEY"))) {
    contents = setEnv(contents, "S3_ACCESS_KEY", "mistri");
  }
  if (needsSecret(envValue(contents, "S3_SECRET_KEY"))) {
    contents = setEnv(contents, "S3_SECRET_KEY", randomBytes(24).toString("hex"));
    generated.push("S3_SECRET_KEY");
  }
  if (needsSecret(envValue(contents, "S3_BUCKET"))) {
    contents = setEnv(contents, "S3_BUCKET", "mistri-calls");
  }
  if (needsSecret(envValue(contents, "S3_ENDPOINT"))) {
    contents = setEnv(contents, "S3_ENDPOINT", "http://localhost:9000");
  }
  if (needsSecret(envValue(contents, "S3_BROWSER_ENDPOINT"))) {
    contents = setEnv(contents, "S3_BROWSER_ENDPOINT", "http://localhost:9000");
  }
  if (needsSecret(envValue(contents, "S3_REGION"))) {
    contents = setEnv(contents, "S3_REGION", "us-east-1");
  }
  if (needsSecret(envValue(contents, "S3_PORT"))) {
    contents = setEnv(contents, "S3_PORT", "9000");
  }
  if (needsSecret(envValue(contents, "S3_CONSOLE_PORT"))) {
    contents = setEnv(contents, "S3_CONSOLE_PORT", "9001");
  }
  if (needsSecret(envValue(contents, "S3_FORCE_PATH_STYLE"))) {
    contents = setEnv(contents, "S3_FORCE_PATH_STYLE", "true");
  }

  await writeFile(envPath, contents.endsWith("\n") ? contents : `${contents}\n`);
  if (generated.length) {
    console.log(`Filled empty local secrets in .env: ${generated.join(", ")}`);
    console.log("Values are only in .env — they are not printed here.");
  }
  return contents;
}

async function dockerUp() {
  await run("docker", ["compose", "up", "-d", "--wait", "postgres", "redis", "minio"]);
}

async function migrate() {
  try {
    await run("pnpm", ["db:migrate"], { capture: true });
  } catch (error) {
    const output = typeof error.output === "string" ? error.output : "";
    if (output.includes("password authentication failed")) {
      throw new Error(
        "Postgres rejected DATABASE_URL. POSTGRES_PASSWORD is applied only on first volume create. If you changed .env, run: docker compose down -v && pnpm bootstrap",
      );
    }
    if (!output.includes('extension "vector" is not available')) {
      throw error;
    }
    console.log(
      "Postgres is missing pgvector. Recreating the container with pgvector/pgvector:pg16 (data volume kept)…",
    );
    await run("docker", [
      "compose",
      "up",
      "-d",
      "--force-recreate",
      "--wait",
      "postgres",
    ]);
    await run("pnpm", ["db:migrate"]);
  }
}

async function main() {
  console.log("Mistri AI setup");

  try {
    await run("docker", ["info"], { silent: true });
  } catch {
    throw new Error("Docker is not running. Start Docker / OrbStack, then retry `pnpm bootstrap`.");
  }

  const envContents = await ensureEnv();
  await mkdir(resolve(root, "uploads"), { recursive: true });

  console.log("Starting Postgres (pgvector), Redis, and MinIO…");
  await dockerUp();

  console.log("Applying schema…");
  await migrate();

  console.log("Seeding demo org, user, and deals…");
  await run("pnpm", ["db:seed"]);

  const pyai = envValue(envContents, "PYAI_API_KEY");
  const llm = envValue(envContents, "LLM_API_KEY");
  if (!pyai) {
    console.log("Note: set PYAI_API_KEY in .env before uploading recordings.");
  }
  if (!llm) {
    console.log("Note: set LLM_API_KEY in .env for speaker names and deal notes.");
  }

  console.log("");
  console.log("Setup complete. Next:");
  console.log("  pnpm dev");
  console.log("Demo login: demo@mistri.ai  (password is SEED_USER_PASSWORD in .env)");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Setup failed";
  console.error(message);
  process.exit(1);
});
