// ==============================================================================
// @ghita/migration -- Type Definitions
// ==============================================================================

export interface Migration {
  readonly version: string;
  readonly name: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

export interface MigrationState {
  readonly currentVersion: string;
  readonly appliedMigrations: readonly string[];
  readonly lastRunAt: string | null;
}

export interface MigrationRunnerConfig {
  readonly stateFile: string;
}
