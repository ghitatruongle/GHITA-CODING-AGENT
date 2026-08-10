#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - Evals: CLI (`pnpm evals run|compare|replay`)
// ==============================================================================

import { parseArgs } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { LongitudinalStore } from './longitudinal.js';
import { renderCompareReport, renderRunReport } from './report.js';
import { replayOffline, replayTrajectory } from './replay.js';
import { defaultAdapter, runSuite } from './runner.js';
import { createInternalSuite, createBrowserSuite, createSkillSuite } from './suites.js';
import type { AgentAdapter, EvalSuite } from './types.js';
import { EVALS_VERSION } from './types.js';

const HELP = `
Usage:
  pnpm --filter @ghita/evals evals run [--suite internal-v1.1.0] [--task <id>] [--out <dir>] [--db <path>] [--adapter fixture|script]
  evals compare <baselineVersion> <candidateVersion> [--suite <name>] [--db <path>]
  evals replay <run.json> [--out <dir>]

Examples:
  pnpm --filter @ghita/evals evals run
  pnpm --filter @ghita/evals evals run --task edit-fix-typo
  pnpm --filter @ghita/evals evals compare 1.0.0 1.1.0
  pnpm --filter @ghita/evals evals replay .ghita/evals/runs/run-xxx.json
`;

interface ParsedArgs {
  values: {
    task?: string[];
    out?: string;
    db?: string;
    adapter?: string;
    suite?: string;
  };
  positionals: string[];
}

export function parseCommandArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      task: { type: 'string', multiple: true },
      out: { type: 'string' },
      db: { type: 'string' },
      adapter: { type: 'string' },
      suite: { type: 'string', default: 'internal-v1.1.0' },
    },
  });
  return {
    values: {
      task: values.task as string[] | undefined,
      out: values.out as string | undefined,
      db: values.db as string | undefined,
      adapter: values.adapter as string | undefined,
      suite: values.suite as string | undefined,
    },
    positionals,
  };
}

/** Load a suite by name or JSON file path. */
export async function readSuite(suiteName: string): Promise<EvalSuite> {
  const internal = createInternalSuite();
  const browser = createBrowserSuite();
  const skills = createSkillSuite();
  if (suiteName === internal.name || suiteName === 'internal') return internal;
  if (suiteName === browser.name || suiteName === 'browser') return browser;
  if (suiteName === skills.name || suiteName === 'skills') return skills;
  const file = resolve(suiteName);
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as EvalSuite;
    return { name: parsed.name, tasks: parsed.tasks };
  }
  throw new Error(
    `unknown suite "${suiteName}" (expected "internal" | "browser" | "skills" | a JSON file path)`,
  );
}

/** Offline deterministic adapter for scripted runs (no model required). */
export const scriptAdapter: AgentAdapter = async (task) => ({
  task,
  output: task.fixture ?? '',
  artifacts: [],
  trajectory: { steps: [{ tool: 'script', args: { taskId: task.id } }] },
  durationMs: 1,
});

export async function loadAdapter(value: string | undefined): Promise<AgentAdapter> {
  if (!value || value === 'fixture') return defaultAdapter;
  if (value === 'script') return scriptAdapter;
  throw new Error(`unsupported adapter "${value}" (fixture | script)`);
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv);
  const command = positionals[0];
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  const outDir = resolve(values.out ?? '.ghita/evals');
  const dbPath = resolve(values.db ?? join(outDir, 'history.db'));
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'runs'), { recursive: true });

  switch (command) {
    case 'run': {
      const suiteName = positionals[1] ?? values.suite ?? 'internal-v1.1.0';
      const suite = await readSuite(suiteName);
      const adapter = await loadAdapter(values.adapter);
      const { runs, summary } = await runSuite(suite, {
        suite: suite.name,
        version: EVALS_VERSION,
        taskFilter: values.task ?? [],
        adapter,
      });

      const lines: string[] = [`# Eval Suite — ${summary.suite}`, ''];
      lines.push(
        `**Total:** ${summary.total} · **Passed:** ${summary.passedCount} · **Failed:** ${summary.failedCount} · **Avg score:** ${summary.averageScore}/100`,
      );
      lines.push('');

      const store = new LongitudinalStore({ dbPath });
      for (const run of runs) {
        store.insertRun(run);
        writeFileSync(join(outDir, 'runs', `${run.runId}.json`), JSON.stringify(run, null, 2));
        lines.push(`- [${run.status}] ${run.task.id} · ${run.score}/100 (${run.runId})`);
        lines.push('');
        lines.push(renderRunReport(run));
        lines.push('');
        if (!run.passed) {
          const replay = replayOffline(run, new Map());
          if (!replay.ok) lines.push(`> Replay (offline): ${replay.errors.join('; ')}`);
        }
      }
      const trend = store.trend(suite.name);
      if (trend.length > 1) {
        lines.push('## 📈 Longitudinal trend');
        lines.push('');
        lines.push('| Version | Average score |');
        lines.push('|---|---|');
        for (const t of trend) lines.push(`| ${t.version} | ${t.score}/100 |`);
        lines.push('');
      }
      store.close();

      const report = lines.join('\n');
      writeFileSync(join(outDir, 'report.md'), report);
      process.stdout.write(report);
      return summary.failedCount > 0 ? 1 : 0;
    }
    case 'compare': {
      const baseline = positionals[1];
      const candidate = positionals[2];
      if (!baseline || !candidate) {
        process.stdout.write('usage: evals compare <baselineVersion> <candidateVersion>\n');
        return 2;
      }
      const store = new LongitudinalStore({ dbPath });
      const suite = values.suite ?? 'internal-v1.1.0';
      const before = store.averageScore(suite, baseline);
      const after = store.averageScore(suite, candidate);
      if (before === null || after === null) {
        process.stdout.write(
          `No stored history for ${suite} @ ${baseline}/${candidate}. Run "evals run" with --db for both versions first.\n`,
        );
        store.close();
        return 2;
      }
      const markdown = renderCompareReport(
        { passed: before > 0, score: before, evidence: [], passReasons: [], failReasons: [] },
        { passed: after > 0, score: after, evidence: [], passReasons: [], failReasons: [] },
        { suite, baselineVersion: baseline, candidateVersion: candidate },
      );
      writeFileSync(join(outDir, 'compare.md'), markdown);
      store.close();
      process.stdout.write(markdown);
      return after < before ? 1 : 0;
    }
    case 'replay': {
      const file = positionals[1];
      if (!file) {
        process.stdout.write('usage: evals replay <run.json>\n');
        return 2;
      }
      const raw = JSON.parse(readFileSync(resolve(file), 'utf-8'));
      const result = await replayTrajectory(raw, async (step) => step.output ?? '');
      writeFileSync(join(outDir, 'replay.json'), JSON.stringify(result, null, 2));
      process.stdout.write(
        result.ok ? 'Replay OK\n' : `Replay failed: ${result.errors.join('; ')}\n`,
      );
      return result.ok ? 0 : 1;
    }
    default:
      process.stdout.write(HELP);
      return 2;
  }
}

// Allow direct execution: node dist/cli.js run
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 2;
    });
}
