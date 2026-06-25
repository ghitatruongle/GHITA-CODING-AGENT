// ==============================================================================
// @ghita/migration -- Migration Registry
// ==============================================================================

import type { Migration } from './types.js';

export class MigrationRegistry {
  private readonly migrations = new Map<string, Migration>();

  register(migration: Migration): void {
    if (this.migrations.has(migration.name)) {
      throw new Error(`Migration already registered: ${migration.name}`);
    }
    this.migrations.set(migration.name, migration);
  }

  getAll(): readonly Migration[] {
    return [...this.migrations.values()].sort((a, b) => a.version.localeCompare(b.version));
  }

  getByName(name: string): Migration | undefined {
    return this.migrations.get(name);
  }

  getByVersion(version: string): Migration | undefined {
    return [...this.migrations.values()].find((m) => m.version === version);
  }
}
