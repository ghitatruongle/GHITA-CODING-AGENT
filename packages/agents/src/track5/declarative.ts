// File-based agent definitions (`agents/*.md` with frontmatter: description,
// allowed-tools, model) + a dispatcher that runs tasks with the declared
// tool surface (Claude Code pattern).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal YAML-subset frontmatter parser (name/description/allowed-tools/model). */
function parseFrontmatter(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const out: Record<string, unknown> = {};
  if (!trimmed.startsWith('---')) return out;
  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) return out;
  for (const line of trimmed.slice(3, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    let value: unknown = raw;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      value = raw.slice(1, -1);
    } else if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (raw !== '' && !Number.isNaN(Number(raw))) value = Number(raw);
    out[key] = value;
  }
  return out;
}

export interface AgentDefinition {
  /** File name (without .md). */
  name: string;
  description: string;
  /** Tool allowlist (empty = all registered tools). */
  allowedTools: string[];
  /** Model role or provider:model override. */
  model?: string;
  /** Max parallel tasks for this agent. */
  concurrency?: number;
}

export interface AgentTask {
  id: string;
  prompt: string;
  cwd?: string;
}

export interface AgentTaskResult {
  taskId: string;
  output: string;
  error?: string;
}

export interface AgentDispatcher {
  (def: AgentDefinition, task: AgentTask): Promise<AgentTaskResult>;
}

/** Parse an agent definition from `agents/<name>.md` content. */
export function parseAgentDefinition(md: string, fallbackName: string): AgentDefinition {
  const frontmatter = parseFrontmatter(md);
  const allowedTools = String(frontmatter['allowed-tools'] ?? frontmatter.allowedTools ?? '')
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    name: String(frontmatter.name ?? fallbackName),
    description: String(frontmatter.description ?? ''),
    allowedTools,
    model: typeof frontmatter.model === 'string' ? frontmatter.model : undefined,
    concurrency: typeof frontmatter.concurrency === 'number' ? frontmatter.concurrency : 1,
  };
}

/** Load all `*.md` agent definitions from a directory. */
export function loadAgentDefinitions(dir: string): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const content = readFileSync(join(dir, entry), 'utf-8');
    out.push(parseAgentDefinition(content, entry.slice(0, -3)));
  }
  return out;
}

/** Run a batch of tasks through a declarative agent (bounded concurrency). */
export async function dispatchAgentTasks(
  def: AgentDefinition,
  tasks: AgentTask[],
  run: AgentDispatcher,
): Promise<AgentTaskResult[]> {
  const concurrency = Math.max(1, def.concurrency ?? 1);
  const results: AgentTaskResult[] = [];
  let index = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const current = index++;
      if (current >= tasks.length) return;
      const task = tasks[current];
      if (task === undefined) return;
      try {
        results.push(await run(def, task));
      } catch (err) {
        results.push({
          taskId: task.id,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/** Tool-surface gate: deny a tool name not in the definition allowlist. */
export function isToolAllowed(def: AgentDefinition, tool: string): boolean {
  if (def.allowedTools.length === 0) return true;
  return def.allowedTools.includes(tool.toLowerCase());
}
