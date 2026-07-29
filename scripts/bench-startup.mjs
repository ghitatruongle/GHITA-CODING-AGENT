#!/usr/bin/env node
/**
 * v0.4.9 B3: Cold-start benchmark for the desktop dev shell.
 *
 * Measures time-to-first-byte of the Vite dev server (a proxy for how fast the
 * WebView shell can begin painting). Spawns `vite`, polls the dev URL until it
 * responds, records the elapsed time, then tears the server down.
 *
 * This is a lightweight, dependency-free signal to compare before/after the
 * B1 bundle-splitting work — it does NOT build the full Tauri binary.
 *
 * Usage:
 *   node scripts/bench-startup.mjs
 *   node scripts/bench-startup.mjs --url=http://localhost:1420 --timeout=60000 --json
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const urlArg = args.find((a) => a.startsWith('--url='));
const timeoutArg = args.find((a) => a.startsWith('--timeout='));
const url = urlArg ? urlArg.split('=')[1] : 'http://localhost:1420/';
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 60_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(target, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 304) return true;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  return false;
}

async function main() {
  const startedAt = Date.now();
  // Start the desktop dev server (Vite) in the desktop workspace.
  const child = spawn('pnpm', ['--filter', '@ghita/desktop', 'dev'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  let ready = false;
  try {
    ready = await waitForServer(url, startedAt + timeoutMs);
  } finally {
    child.kill();
  }

  const elapsedMs = Date.now() - startedAt;
  const report = { url, ready, elapsedMs, timeoutMs };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (ready) {
    console.info(`Cold-start: dev server responded in ${elapsedMs} ms (${url}).`);
  } else {
    console.error(`Cold-start: dev server did NOT respond within ${timeoutMs} ms (${url}).`);
  }

  process.exit(ready ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`bench-startup failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
