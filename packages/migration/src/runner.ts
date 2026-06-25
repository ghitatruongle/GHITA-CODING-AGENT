// ==============================================================================
// @ghita/migration -- Migration Runner
// ==============================================================================

import type { Migration, MigrationState, MigrationRunnerConfig } from './types.js';

export class MigrationRunner {
  private state: MigrationState;
  private readonly config: MigrationRunnerConfig;

  constructor(config: MigrationRunnerConfig, initialState?: MigrationState) {
    this.config = config;
    this.state = initialState ?? {
      currentVersion: '0.0.0',
      appliedMigrations: [],
      lastRunAt: null,
    };
  }

  getState(): MigrationState {
    return { ...this.state };
  }

  getConfig(): MigrationRunnerConfig {
    return { ...this.config };
  }

  async runUp(migrations: readonly Migration[]): Promise<string[]> {
    const applied: string[] = [];
    const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version));
    for (const migration of sorted) {
      if (this.state.appliedMigrations.includes(migration.name)) continue;
      await migration.up();
      this.state = {
        currentVersion: migration.version,
        appliedMigrations: [...this.state.appliedMigrations, migration.name],
        lastRunAt: new Date().toISOString(),
      };
      applied.push(migration.name);
    }
    return applied;
  }

  async runDown(migrations: readonly Migration[], count = 1): Promise<string[]> {
    const rolledBack: string[] = [];
    const sorted = [...migrations]
      .sort((a, b) => b.version.localeCompare(a.version))
      .filter((m) => this.state.appliedMigrations.includes(m.name));
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const migration = sorted[i];
      if (!migration) continue;
      await migration.down();
      this.state = {
        currentVersion: i + 1 < sorted.length ? (sorted[i + 1]?.version ?? '0.0.0') : '0.0.0',
        appliedMigrations: this.state.appliedMigrations.filter((n) => n !== migration.name),
        lastRunAt: new Date().toISOString(),
      };
      rolledBack.push(migration.name);
    }
    return rolledBack;
  }
}
