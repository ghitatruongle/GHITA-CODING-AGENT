import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const SECRET_KEY_PATTERN =
  /^(?:api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|password|authorization|cookie)$/i;
const SENSITIVE_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password)\s*[:=]\s*\S{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
];
const ALLOWED_MEMORY_TYPES = new Set(['conversation', 'preference', 'fact', 'context']);

function workspaceId(workspaceRoot) {
  return createHash('sha256')
    .update(path.resolve(workspaceRoot).toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function sanitizeMetadata(value, key = '') {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeMetadata(entryValue, entryKey),
      ]),
    );
  }
  if (typeof value === 'string') return value.slice(0, 4_000);
  return value;
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (
    typeof entry.id !== 'string' ||
    entry.id.length === 0 ||
    entry.id.length > 200 ||
    typeof entry.content !== 'string' ||
    entry.content.length === 0 ||
    entry.content.length > 16_000 ||
    !ALLOWED_MEMORY_TYPES.has(entry.type)
  ) {
    return null;
  }
  return {
    id: entry.id,
    type: entry.type,
    content: entry.content,
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
    ...(entry.metadata && typeof entry.metadata === 'object'
      ? { metadata: sanitizeMetadata(entry.metadata) }
      : {}),
  };
}

export function containsSensitiveMemory(content) {
  return SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(String(content)));
}

export class WorkspaceMemoryJournal {
  constructor(rootDir, options = {}) {
    if (!path.isAbsolute(rootDir)) {
      throw new Error('Workspace memory journal path must be absolute.');
    }
    this.rootDir = path.resolve(rootDir);
    this.maxEntries = options.maxEntries ?? 500;
    this.maxBytes = options.maxBytes ?? 4_000_000;
  }

  resolvePath(workspaceRoot) {
    return path.join(this.rootDir, `${workspaceId(workspaceRoot)}.json`);
  }

  async load(workspaceRoot) {
    try {
      const payload = JSON.parse(await fs.readFile(this.resolvePath(workspaceRoot), 'utf8'));
      if (payload.version !== 1 || payload.workspaceId !== workspaceId(workspaceRoot)) {
        throw new Error('Workspace memory journal identity mismatch.');
      }
      return Array.isArray(payload.entries)
        ? payload.entries.map(sanitizeEntry).filter(Boolean).slice(-this.maxEntries)
        : [];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(workspaceRoot, entries) {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const sanitizedEntries = entries
      .map(sanitizeEntry)
      .filter(Boolean)
      .filter((entry) => !containsSensitiveMemory(entry.content))
      .slice(-this.maxEntries);
    const payload = {
      version: 1,
      workspaceId: workspaceId(workspaceRoot),
      entries: sanitizedEntries,
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > this.maxBytes) {
      throw new Error(`Workspace memory exceeds ${this.maxBytes} bytes.`);
    }

    const target = this.resolvePath(workspaceRoot);
    const temporary = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, target);
      await fs.chmod(target, 0o600).catch(() => undefined);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
    return sanitizedEntries;
  }
}
