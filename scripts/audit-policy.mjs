#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowlist = JSON.parse(
  readFileSync(join(root, 'docs', 'security', 'audit-allowlist.json'), 'utf8'),
);
const pnpmCli = process.env.npm_execpath;
const audit = spawnSync(
  pnpmCli ? process.execPath : 'pnpm',
  pnpmCli ? [pnpmCli, 'audit', '--prod', '--json'] : ['audit', '--prod', '--json'],
  {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: !pnpmCli && process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
  },
);

if (!audit.stdout) {
  console.error(audit.stderr || audit.error?.message || 'pnpm audit produced no report');
  process.exit(2);
}

const report = JSON.parse(audit.stdout);
const advisories = Object.values(report.advisories ?? {});
const today = new Date().toISOString().slice(0, 10);
const failures = [];
const accepted = [];

for (const advisory of advisories) {
  if (advisory.severity !== 'critical' && advisory.severity !== 'high') continue;
  const id = advisory.github_advisory_id;
  const exception = allowlist[id];
  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
  const pathsAllowed =
    exception &&
    paths.length > 0 &&
    paths.every((path) =>
      exception.allowedPaths.some((allowedPrefix) => path.startsWith(allowedPrefix)),
    );

  if (
    !exception ||
    exception.severity !== advisory.severity ||
    exception.expires < today ||
    !pathsAllowed
  ) {
    failures.push({
      id,
      severity: advisory.severity,
      module: advisory.module_name,
      title: advisory.title,
      paths,
    });
  } else {
    accepted.push({
      id,
      module: advisory.module_name,
      expires: exception.expires,
      reason: exception.reason,
    });
  }
}

for (const exception of accepted) {
  console.warn(
    `ALLOWLISTED ${exception.id} (${exception.module}) until ${exception.expires}: ${exception.reason}`,
  );
}

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.info(
  `Audit policy passed: critical=${counts.critical ?? 0}, high=${counts.high ?? 0}, moderate=${counts.moderate ?? 0}, low=${counts.low ?? 0}`,
);
