#!/usr/bin/env node
/**
 * Local `pnpm dev`: optional Cloudflare quick tunnel so PyAI can fetch large recordings.
 * Does not write the tunnel URL to .env (it changes every run). Does not print signed audio URLs.
 * Skip with DEV_TUNNEL=0.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TUNNEL_NAME = "mistri-pyai-tunnel";
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const skipTunnel =
  process.env.DEV_TUNNEL === "0" || process.env.DEV_TUNNEL === "false";

let tunnelProc = null;
let appsProc = null;
let shuttingDown = false;

function spawnInherit(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: false,
  });
}

function stopTunnel() {
  if (tunnelProc && !tunnelProc.killed) {
    tunnelProc.kill("SIGTERM");
  }
  spawn("docker", ["rm", "-f", TUNNEL_NAME], {
    stdio: "ignore",
    shell: false,
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (appsProc && !appsProc.killed) {
    appsProc.kill("SIGTERM");
  }
  stopTunnel();
  setTimeout(() => process.exit(code), 300).unref();
}

function startApps(extraEnv = {}) {
  appsProc = spawnInherit("pnpm", ["-r", "--parallel", "--filter", "./apps/*", "dev"], extraEnv);
  appsProc.on("exit", (code) => {
    stopTunnel();
    process.exit(code ?? 0);
  });
}

function startTunnel() {
  return new Promise((resolvePromise) => {
    spawn("docker", ["rm", "-f", TUNNEL_NAME], { stdio: "ignore", shell: false }).on("close", () => {
      const child = spawn(
        "docker",
        [
          "run",
          "--rm",
          "--name",
          TUNNEL_NAME,
          "--add-host=host.docker.internal:host-gateway",
          "cloudflare/cloudflared:latest",
          "tunnel",
          "--no-autoupdate",
          "--url",
          "http://host.docker.internal:3001",
        ],
        {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        },
      );
      tunnelProc = child;

      let found = false;
      const onChunk = (chunk) => {
        const text = chunk.toString();
        const match = text.match(TUNNEL_URL_RE);
        if (match && !found) {
          found = true;
          resolvePromise(match[0].replace(/\/$/, ""));
        }
      };
      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);
      child.on("error", () => {
        if (!found) resolvePromise(null);
      });
      child.on("exit", () => {
        if (!found) resolvePromise(null);
      });

      setTimeout(() => {
        if (!found) {
          console.warn("Dev tunnel did not come up in time. Large PyAI jobs need a public https origin.");
          resolvePromise(null);
        }
      }, 90_000);
    });
  });
}

async function main() {
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  if (skipTunnel) {
    startApps();
    return;
  }

  console.log("Starting a public https tunnel so PyAI can fetch large recordings…");
  const origin = await startTunnel();
  if (!origin) {
    console.warn("Continuing without a tunnel. Set DEV_TUNNEL=0 to hide this, or install Docker / OrbStack.");
    startApps();
    return;
  }

  console.log(`PyAI fetch origin: ${origin}`);
  console.log("This URL is public while pnpm dev is running. Disable with DEV_TUNNEL=0.");
  startApps({ PYAI_FETCH_BASE_URL: origin });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "dev failed";
  console.error(message);
  shutdown(1);
});
