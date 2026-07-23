import { pathToFileURL } from 'node:url';
#!/usr/bin/env node

/** Minimal deny-by-default command check used for the example only. */
export function validateDryRunCommand(cmd) {
  const denied = [/\brm\s+-rf\s+\//i, /\bmkfs\b/i, /\bdd\s+.*of=\/dev\//i];
  for (const re of denied) {
    if (re.test(cmd)) {
      return { safe: false, reason: `denied by pattern ${re}` };
    }
  }
  return { safe: true };
}

export function runComputerUseDryRun() {
  const samples = ['ls -la', 'rm -rf /', 'echo hi'];
  return samples.map((cmd) => ({ cmd, ...validateDryRunCommand(cmd) }));
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  console.log(JSON.stringify(runComputerUseDryRun(), null, 2));
}
