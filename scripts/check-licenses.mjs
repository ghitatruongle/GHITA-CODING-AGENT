import { spawnSync } from 'node:child_process';

const forbidden = [
  /\bGPL-3\.0(?:-only|-or-later)?\b/i,
  /\bAGPL-3\.0(?:-only|-or-later)?\b/i,
  /\bSSPL\b/i,
];
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmCli = process.env.npm_execpath;
const command = pnpmCli ? process.execPath : pnpm;
const args = pnpmCli
  ? [pnpmCli, 'licenses', 'list', '--prod', '--json']
  : ['licenses', 'list', '--prod', '--json'];

const result = spawnSync(command, args, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: !pnpmCli && process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout);
const violations = [];
let packageCount = 0;

for (const [expression, packages] of Object.entries(report)) {
  packageCount += packages.length;

  const alternatives = expression
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/i)
    .map((part) => part.trim());
  const hasAllowedAlternative = alternatives.some(
    (alternative) => !forbidden.some((pattern) => pattern.test(alternative)),
  );

  if (!hasAllowedAlternative) {
    for (const dependency of packages) {
      violations.push(`${dependency.name}@${dependency.versions.join(',')} (${expression})`);
    }
  }
}

if (violations.length > 0) {
  console.error('Forbidden production licenses detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.info(
  `License policy passed: ${packageCount} production package records, no GPL-3.0/AGPL-3.0/SSPL-only dependency.`,
);
