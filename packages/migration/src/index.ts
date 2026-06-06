// ==============================================================================
// GHITA CODING AGENT - Migration Tools (Phase 47)
// Import/Export, version migration, backup/restore
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

// --- Types ---

export interface MigrationStep {
  version: string;
  description: string;
  up: (data: Record<string, unknown>) => Record<string, unknown>;
  down: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  stepsApplied: string[];
  errors: string[];
  timestamp: number;
}

export interface BackupMetadata {
  id: string;
  createdAt: number;
  version: string;
  files: string[];
  sizeBytes: number;
}

export interface ImportSource {
  type: 'openclaw' | 'ghita' | 'generic';
  path: string;
}

export interface ExportOptions {
  format: 'json' | 'yaml' | 'tar';
  includeSecrets: boolean;
  outputPath: string;
}

// --- Migration Registry ---

const MIGRATION_STEPS: MigrationStep[] = [
  {
    version: '0.0.2',
    description: 'Migrate providers from array to map',
    up: (data) => {
      const providers = data['providers'];
      if (Array.isArray(providers)) {
        const map: Record<string, unknown> = {};
        for (const p of providers as Array<{ id: string; [k: string]: unknown }>) {
          map[p.id] = p;
        }
        return { ...data, providers: map };
      }
      return data;
    },
    down: (data) => {
      const providers = data['providers'];
      if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
        return { ...data, providers: Object.values(providers as Record<string, unknown>) };
      }
      return data;
    },
  },
  {
    version: '0.0.3',
    description: 'Add skills lockfile reference',
    up: (data) => {
      if (!data['skillsLockfile']) {
        return { ...data, skillsLockfile: 'skills-lock.json' };
      }
      return data;
    },
    down: (data) => {
      const { skillsLockfile: _, ...rest } = data;
      return rest;
    },
  },
];

// --- Migration Engine ---

export class MigrationEngine {
  private steps: MigrationStep[];

  constructor(extraSteps?: MigrationStep[]) {
    this.steps = [...MIGRATION_STEPS, ...(extraSteps ?? [])];
    this.steps.sort((a, b) => a.version.localeCompare(b.version));
  }

  migrate(data: Record<string, unknown>, fromVersion: string, toVersion: string): MigrationResult {
    const result: MigrationResult = {
      success: true,
      fromVersion,
      toVersion,
      stepsApplied: [],
      errors: [],
      timestamp: Date.now(),
    };

    let current = { ...data };
    const applicableSteps = this.steps.filter(
      (s) => s.version > fromVersion && s.version <= toVersion,
    );

    for (const step of applicableSteps) {
      try {
        current = step.up(current);
        result.stepsApplied.push(`${step.version}: ${step.description}`);
      } catch (err) {
        result.errors.push(`${step.version}: ${err instanceof Error ? err.message : String(err)}`);
        result.success = false;
        break;
      }
    }

    return result;
  }

  rollback(data: Record<string, unknown>, fromVersion: string, toVersion: string): MigrationResult {
    const result: MigrationResult = {
      success: true,
      fromVersion,
      toVersion,
      stepsApplied: [],
      errors: [],
      timestamp: Date.now(),
    };

    let current = { ...data };
    const applicableSteps = this.steps
      .filter((s) => s.version <= fromVersion && s.version > toVersion)
      .reverse();

    for (const step of applicableSteps) {
      try {
        current = step.down(current);
        result.stepsApplied.push(`${step.version}: rollback ${step.description}`);
      } catch (err) {
        result.errors.push(`${step.version}: ${err instanceof Error ? err.message : String(err)}`);
        result.success = false;
        break;
      }
    }

    return result;
  }

  getAvailableVersions(): string[] {
    return this.steps.map((s) => s.version);
  }
}

// --- Backup Manager ---

export class BackupManager {
  private backupDir: string;

  constructor(backupDir: string) {
    this.backupDir = backupDir;
  }

  async createBackup(configDir: string, version: string): Promise<BackupMetadata> {
    const id = `backup-${Date.now()}`;
    const backupPath = path.join(this.backupDir, id);
    fs.mkdirSync(backupPath, { recursive: true });

    const files = this.collectFiles(configDir);
    let totalSize = 0;

    for (const file of files) {
      const src = path.join(configDir, file);
      const dest = path.join(backupPath, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      totalSize += fs.statSync(src).size;
    }

    const metadata: BackupMetadata = {
      id,
      createdAt: Date.now(),
      version,
      files,
      sizeBytes: totalSize,
    };

    fs.writeFileSync(
      path.join(backupPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
    );

    return metadata;
  }

  async restore(backupId: string, targetDir: string): Promise<boolean> {
    const backupPath = path.join(this.backupDir, backupId);
    if (!fs.existsSync(backupPath)) return false;

    const metadataPath = path.join(backupPath, 'metadata.json');
    if (!fs.existsSync(metadataPath)) return false;

    const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    fs.mkdirSync(targetDir, { recursive: true });

    for (const file of metadata.files) {
      const src = path.join(backupPath, file);
      const dest = path.join(targetDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    return true;
  }

  listBackups(): BackupMetadata[] {
    if (!fs.existsSync(this.backupDir)) return [];

    return fs.readdirSync(this.backupDir)
      .filter((d: string) => d.startsWith('backup-'))
      .map((d: string) => {
        const metaPath = path.join(this.backupDir, d, 'metadata.json');
        if (!fs.existsSync(metaPath)) return null;
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BackupMetadata;
      })
      .filter((m: BackupMetadata | null): m is BackupMetadata => m !== null);
  }

  private collectFiles(dir: string, prefix = ''): string[] {
    const result: string[] = [];
    if (!fs.existsSync(dir)) return result;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push(...this.collectFiles(path.join(dir, entry.name), rel));
      } else if (entry.isFile()) {
        result.push(rel);
      }
    }
    return result;
  }
}

// --- Config Importer ---

export class ConfigImporter {
  /**
   * Import config from an OpenClaw-format JSON file.
   */
  importFromOpenClaw(filePath: string): Record<string, unknown> {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    // Map OpenClaw fields to GHITA format
    return {
      providers: this.mapProviders(data['providers']),
      skills: data['skills'] ?? [],
      agents: data['agents'] ?? [],
      settings: {
        theme: data['theme'] ?? 'dark',
        language: data['locale'] ?? 'en',
      },
    };
  }

  /**
   * Export config to a portable format.
   */
  exportConfig(config: Record<string, unknown>, options: ExportOptions): string {
    const exportData = options.includeSecrets
      ? config
      : this.stripSecrets(config);

    const outputPath = options.outputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (options.format === 'json') {
      const content = JSON.stringify(exportData, null, 2);
      fs.writeFileSync(outputPath, content);
      return content;
    }

    // For other formats, default to JSON
    const content = JSON.stringify(exportData, null, 2);
    fs.writeFileSync(outputPath, content);
    return content;
  }

  private mapProviders(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    if (Array.isArray(raw)) {
      const map: Record<string, unknown> = {};
      for (const p of raw as Array<{ id: string; [k: string]: unknown }>) {
        if (p?.id) map[p.id] = p;
      }
      return map;
    }
    return raw as Record<string, unknown>;
  }

  private stripSecrets(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const secretKeys = ['apiKey', 'api_key', 'secret', 'token', 'password'];

    for (const [key, value] of Object.entries(data)) {
      if (secretKeys.includes(key.toLowerCase())) {
        result[key] = '***REDACTED***';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.stripSecrets(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
