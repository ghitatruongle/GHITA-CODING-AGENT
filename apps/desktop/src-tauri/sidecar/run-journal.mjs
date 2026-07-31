import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SECRET_KEY_PATTERN =
  /^(?:api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|password|authorization|cookie|set-cookie)$/i;
const VALID_STATUSES = new Set(['running', 'completed', 'failed', 'interrupted', 'exhausted']);

function truncateString(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n… [truncated ${value.length - maxLength} chars]`;
}

function sanitizeValue(value, key = '', limits = { string: 65_536, array: 200 }) {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return truncateString(value, limits.string);
  if (Array.isArray(value)) {
    return value
      .slice(-limits.array)
      .map((item) => sanitizeValue(item, '', limits));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey, limits),
      ]),
    );
  }
  return value;
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new TypeError('Agent checkpoint must be an object.');
  }
  if (checkpoint.version !== 1) {
    throw new Error(`Unsupported agent checkpoint version: ${String(checkpoint.version)}`);
  }
  if (!RUN_ID_PATTERN.test(checkpoint.runId ?? '')) {
    throw new Error('Invalid agent run ID.');
  }
  if (!VALID_STATUSES.has(checkpoint.status)) {
    throw new Error(`Invalid agent run status: ${String(checkpoint.status)}`);
  }
}

export function createRunId(now = Date.now()) {
  return `run_${now.toString(36)}_${randomBytes(6).toString('hex')}`;
}

export function redactRunCheckpoint(checkpoint) {
  validateCheckpoint(checkpoint);
  return sanitizeValue(checkpoint);
}

export class AgentRunJournal {
  constructor(rootDir, options = {}) {
    if (!path.isAbsolute(rootDir)) {
      throw new Error('Agent run journal path must be absolute.');
    }
    this.rootDir = path.resolve(rootDir);
    this.maxRuns = options.maxRuns ?? 100;
    this.maxBytes = options.maxBytes ?? 2_000_000;
  }

  resolveRunPath(runId) {
    if (!RUN_ID_PATTERN.test(runId ?? '')) {
      throw new Error('Invalid agent run ID.');
    }
    return path.join(this.rootDir, `${runId}.json`);
  }

  async save(checkpoint) {
    validateCheckpoint(checkpoint);
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });

    let sanitized = redactRunCheckpoint(checkpoint);
    let serialized = JSON.stringify(sanitized, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > this.maxBytes) {
      sanitized = sanitizeValue(checkpoint, '', { string: 8_000, array: 50 });
      serialized = JSON.stringify(sanitized, null, 2);
    }
    if (Buffer.byteLength(serialized, 'utf8') > this.maxBytes) {
      throw new Error(`Agent checkpoint exceeds ${this.maxBytes} bytes after compaction.`);
    }

    const target = this.resolveRunPath(checkpoint.runId);
    const temporary = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, target);
      await fs.chmod(target, 0o600).catch(() => undefined);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }

    await this.prune(checkpoint.runId);
    return sanitized;
  }

  async load(runId) {
    const content = await fs.readFile(this.resolveRunPath(runId), 'utf8');
    const checkpoint = JSON.parse(content);
    validateCheckpoint(checkpoint);
    if (checkpoint.runId !== runId) {
      throw new Error('Agent checkpoint filename does not match its run ID.');
    }
    return checkpoint;
  }

  async list(limit = 50) {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const checkpoints = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const runId = entry.name.slice(0, -'.json'.length);
      if (!RUN_ID_PATTERN.test(runId)) continue;
      try {
        const checkpoint = await this.load(runId);
        checkpoints.push({
          runId,
          status: checkpoint.status,
          task: truncateString(String(checkpoint.userMessage ?? ''), 240),
          agentName: checkpoint.agentName,
          nextIteration: checkpoint.nextIteration,
          stepsCount: Array.isArray(checkpoint.steps) ? checkpoint.steps.length : 0,
          pendingActionsCount: Array.isArray(checkpoint.pendingActions)
            ? checkpoint.pendingActions.length
            : 0,
          outputPreview: truncateString(String(checkpoint.output ?? ''), 240),
          error: truncateString(String(checkpoint.error ?? ''), 240),
          updatedAt: checkpoint.updatedAt,
        });
      } catch {
        // Ignore corrupt or incompatible entries instead of breaking history.
      }
    }

    return checkpoints
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
      .slice(0, Math.max(0, Math.min(limit, 100)));
  }

  async markStatus(runId, status, error) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid agent run status: ${String(status)}`);
    }
    const checkpoint = await this.load(runId);
    return this.save({
      ...checkpoint,
      status,
      ...(error ? { error: truncateString(String(error), 4_000) } : {}),
      updatedAt: Date.now(),
    });
  }

  async prune(preserveRunId) {
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const runId = entry.name.slice(0, -'.json'.length);
      if (!RUN_ID_PATTERN.test(runId) || runId === preserveRunId) continue;
      const filePath = this.resolveRunPath(runId);
      const stat = await fs.stat(filePath);
      files.push({ filePath, mtimeMs: stat.mtimeMs });
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const keepOtherRuns = Math.max(0, this.maxRuns - 1);
    await Promise.all(
      files
        .slice(keepOtherRuns)
        .map(({ filePath }) => fs.rm(filePath, { force: true })),
    );
  }
}
