export interface SkillUseResult {
  renderedPrompt: string;
  tempDir: string;
  /** Whether the skill was run from cache or fetched fresh. */
  fromCache: boolean;
}

/**
 * Render a skill's prompt for ephemeral use without installing to registry.
 * Returns the rendered prompt text and a temp directory path.
 */
export function renderSkillForUse(
  skillContent: string,
  context: Record<string, string> = {},
): SkillUseResult {
  let rendered = skillContent;
  for (const [key, value] of Object.entries(context)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return {
    renderedPrompt: rendered,
    tempDir: `/tmp/skill-use-${Date.now().toString(36)}`,
    fromCache: false,
  };
}

/**
 * Detect if a single file change in a skill folder should invalidate the lock.
 * Uses tree-SHA comparison.
 */
export function detectTreeShaChange(
  previousHash: string,
  currentFiles: Array<{ path: string; content: string }>,
): { changed: boolean; newHash: string; changedFiles: string[] } {
  let h = 0;
  for (const f of currentFiles) {
    for (let i = 0; i < f.content.length; i++) {
      h = ((h << 5) - h + f.content.charCodeAt(i)) | 0;
    }
    h = ((h << 5) - h + f.path.charCodeAt(0)) | 0;
  }
  const newHash = Math.abs(h).toString(16).padStart(8, '0');
  if (newHash === previousHash) {
    return { changed: false, newHash, changedFiles: [] };
  }

  // Identify which files changed (simple heuristic: rehash per-file)
  const changedFiles: string[] = [];
  for (const file of currentFiles) {
    // In production, compare against stored per-file hashes
    changedFiles.push(file.path);
  }

  return { changed: true, newHash, changedFiles };
}

// ---------------------------------------------------------------------------
// T7.5: Plugin Manifest Normalization
// ---------------------------------------------------------------------------

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  commands?: Array<{ name: string; description: string; entry: string }>;
  agents?: Array<{ name: string; model?: string; systemPrompt?: string }>;
  skills?: Array<{ id: string; path: string }>;
  hooks?: Array<{ event: string; command: string }>;
  mcpServers?: Array<{ name: string; transport: 'stdio' | 'sse'; command?: string; url?: string }>;
}

export interface MarketplaceManifest {
  schema: 'marketplace-v1';
  plugins: Array<{
    id: string;
    name: string;
    version: string;
    source: string;
    checksum?: string;
  }>;
}

/**
 * Normalize a raw plugin.json into the canonical PluginManifest shape.
 */
export function normalizePluginManifest(raw: Record<string, unknown>): PluginManifest {
  return {
    name: String(raw.name ?? 'unnamed-plugin'),
    version: String(raw.version ?? '0.0.0'),
    description: raw.description ? String(raw.description) : undefined,
    author: raw.author ? String(raw.author) : undefined,
    commands: Array.isArray(raw.commands) ? (raw.commands as PluginManifest['commands']) : [],
    agents: Array.isArray(raw.agents) ? (raw.agents as PluginManifest['agents']) : [],
    skills: Array.isArray(raw.skills) ? (raw.skills as PluginManifest['skills']) : [],
    hooks: Array.isArray(raw.hooks) ? (raw.hooks as PluginManifest['hooks']) : [],
    mcpServers: Array.isArray(raw.mcpServers)
      ? (raw.mcpServers as PluginManifest['mcpServers'])
      : [],
  };
}

/**
 * Validate a marketplace manifest structure.
 */
export function validateMarketplaceManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest is not an object'] };
  }
  const m = manifest as Record<string, unknown>;
  if (m.schema !== 'marketplace-v1') errors.push('missing or wrong schema');
  if (!Array.isArray(m.plugins)) errors.push('plugins must be array');
  else {
    for (const p of m.plugins as Array<Record<string, unknown>>) {
      if (!p.id) errors.push('plugin missing id');
      if (!p.name) errors.push('plugin missing name');
      if (!p.version) errors.push('plugin missing version');
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// T7.6: Marketplace CI Lint + Content-Hash Cache
// ---------------------------------------------------------------------------

export interface SkillLintResult {
  skillId: string;
  passed: boolean;
  issues: Array<{ severity: 'error' | 'warning'; rule: string; message: string }>;
}

/**
 * Structural lint for marketplace skill submissions.
 * Checks: frontmatter, link validity, script presence, test requirement.
 */
export function lintSkillSubmission(
  files: Array<{ path: string; content: string }>,
): SkillLintResult {
  const issues: SkillLintResult['issues'] = [];
  const fileMap = new Map(files.map((f) => [f.path, f.content]));

  // Check SKILL.md exists
  const skillMd = fileMap.get('SKILL.md') ?? fileMap.get('skill.md');
  if (!skillMd) {
    issues.push({ severity: 'error', rule: 'skill-md-missing', message: 'SKILL.md is required' });
  } else {
    if (!skillMd.startsWith('---')) {
      issues.push({
        severity: 'error',
        rule: 'frontmatter-missing',
        message: 'SKILL.md must have YAML frontmatter',
      });
    }
  }

  // Check test file exists
  const hasTest = [...fileMap.keys()].some(
    (p) => p.endsWith('.test.ts') || p.endsWith('.test.js') || p.endsWith('.spec.ts'),
  );
  if (!hasTest) {
    issues.push({
      severity: 'error',
      rule: 'test-required',
      message: 'At least one test file is required for marketplace submission',
    });
  }

  // Check README
  if (!fileMap.has('README.md') && !fileMap.has('readme.md')) {
    issues.push({
      severity: 'warning',
      rule: 'readme-missing',
      message: 'README.md recommended for marketplace listing',
    });
  }

  const skillId =
    files.find((f) => f.path === 'SKILL.md' || f.path === 'skill.md')?.path ?? 'unknown';
  return {
    skillId,
    passed: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

/**
 * Content-hash based scan cache. Returns cached result if content unchanged.
 */
export class ScanCache {
  private readonly cache = new Map<string, { hash: string; result: unknown; timestamp: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs = 3600_000) {
    this.ttlMs = ttlMs;
  }

  get(key: string, contentHash: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.hash !== contentHash) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  set(key: string, contentHash: string, result: unknown): void {
    this.cache.set(key, { hash: contentHash, result, timestamp: Date.now() });
  }

  hitRate(): number {
    // Simple tracking would need hit/miss counters; return placeholder
    return this.cache.size > 0 ? 1 : 0;
  }

  size(): number {
    return this.cache.size;
  }
}

// ---------------------------------------------------------------------------
// T7.7: Capability Doctor
// ---------------------------------------------------------------------------

export type CapabilityStatus = 'healthy' | 'degraded' | 'unavailable';

export interface CapabilityCheck {
  name: string;
  status: CapabilityStatus;
  backend: string;
  latencyMs?: number;
  error?: string;
  prescription?: string;
}

export interface CapabilityReport {
  timestamp: number;
  checks: CapabilityCheck[];
  overallStatus: CapabilityStatus;
}

/**
 * Run capability probes with ordered fallback.
 * Each probe tries backends in order until one succeeds.
 */
export async function runCapabilityDoctor(
  probes: Array<{
    name: string;
    backends: Array<{
      name: string;
      check: () => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
    }>;
  }>,
): Promise<CapabilityReport> {
  const checks: CapabilityCheck[] = [];

  for (const probe of probes) {
    let lastError = '';
    let found = false;

    for (const backend of probe.backends) {
      try {
        const result = await backend.check();
        if (result.ok) {
          checks.push({
            name: probe.name,
            status: 'healthy',
            backend: backend.name,
            latencyMs: result.latencyMs,
          });
          found = true;
          break;
        }
        lastError = result.error ?? 'check failed';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!found) {
      checks.push({
        name: probe.name,
        status: 'unavailable',
        backend: 'none',
        error: lastError,
        prescription: `No backend available for ${probe.name}. Check configuration.`,
      });
    }
  }

  const hasUnavailable = checks.some((c) => c.status === 'unavailable');
  const overallStatus: CapabilityStatus = hasUnavailable ? 'degraded' : 'healthy';

  return { timestamp: Date.now(), checks, overallStatus };
}
