// @ghita/migration -- Comprehensive Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { MigrationRunner } from '../runner.js';
import { MigrationRegistry } from '../registry.js';
import { compareVersions, isValidVersion } from '../version-detector.js';
import type { Migration } from '../types.js';

function createMockMigration(name: string, version: string): Migration {
  return {
    name,
    version,
    up: async () => {},
    down: async () => {},
  };
}

// MigrationRunner

describe('MigrationRunner', () => {
  it('runs migrations in version order', async () => {
    const runner = new MigrationRunner({ stateFile: '/tmp/state.json' });
    const applied: string[] = [];
    const migrations: Migration[] = [
      { ...createMockMigration('create-users', '0.0.2'), up: async () => { applied.push('create-users'); } },
      { ...createMockMigration('create-posts', '0.0.1'), up: async () => { applied.push('create-posts'); } },
    ];
    const result = await runner.runUp(migrations);
    expect(result).toEqual(['create-posts', 'create-users']);
    expect(applied).toEqual(['create-posts', 'create-users']);
    expect(runner.getState().currentVersion).toBe('0.0.2');
  });

  it('skips already applied migrations', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      { currentVersion: '0.0.1', appliedMigrations: ['create-posts'], lastRunAt: null },
    );
    const migrations = [
      createMockMigration('create-posts', '0.0.1'),
      createMockMigration('create-users', '0.0.2'),
    ];
    const applied = await runner.runUp(migrations);
    expect(applied).toEqual(['create-users']);
  });

  it('returns empty array when nothing to apply', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      { currentVersion: '0.0.2', appliedMigrations: ['create-posts', 'create-users'], lastRunAt: null },
    );
    const migrations = [createMockMigration('create-posts', '0.0.1')];
    const applied = await runner.runUp(migrations);
    expect(applied).toEqual([]);
  });

  it('rolls back migrations', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      { currentVersion: '0.0.2', appliedMigrations: ['create-posts', 'create-users'], lastRunAt: null },
    );
    const migrations = [
      createMockMigration('create-posts', '0.0.1'),
      createMockMigration('create-users', '0.0.2'),
    ];
    const rolledBack = await runner.runDown(migrations, 1);
    expect(rolledBack).toEqual(['create-users']);
    expect(runner.getState().currentVersion).toBe('0.0.1');
    expect(runner.getState().appliedMigrations).toEqual(['create-posts']);
  });

  it('rolls back multiple migrations', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      { currentVersion: '0.0.3', appliedMigrations: ['a', 'b', 'c'], lastRunAt: null },
    );
    const migrations = [
      createMockMigration('a', '0.0.1'),
      createMockMigration('b', '0.0.2'),
      createMockMigration('c', '0.0.3'),
    ];
    const rolledBack = await runner.runDown(migrations, 2);
    expect(rolledBack).toEqual(['c', 'b']);
    expect(runner.getState().currentVersion).toBe('0.0.1');
  });

  it('returns empty rollback when nothing applied', async () => {
    const runner = new MigrationRunner({ stateFile: '/tmp/state.json' });
    const rolledBack = await runner.runDown([], 1);
    expect(rolledBack).toEqual([]);
  });

  it('sets lastRunAt on migration', async () => {
    const runner = new MigrationRunner({ stateFile: '/tmp/state.json' });
    expect(runner.getState().lastRunAt).toBeNull();
    await runner.runUp([createMockMigration('test', '0.0.1')]);
    expect(runner.getState().lastRunAt).not.toBeNull();
  });
});

// MigrationRegistry

describe('MigrationRegistry', () => {
  let registry: MigrationRegistry;

  beforeEach(() => {
    registry = new MigrationRegistry();
  });

  it('registers and retrieves migrations', () => {
    const m = createMockMigration('test', '0.0.1');
    registry.register(m);
    expect(registry.getByName('test')).toBe(m);
    expect(registry.getByVersion('0.0.1')).toBe(m);
  });

  it('throws on duplicate registration', () => {
    registry.register(createMockMigration('test', '0.0.1'));
    expect(() => registry.register(createMockMigration('test', '0.0.2'))).toThrow(
      'Migration already registered: test',
    );
  });

  it('returns all migrations sorted by version', () => {
    registry.register(createMockMigration('b', '0.0.2'));
    registry.register(createMockMigration('a', '0.0.1'));
    registry.register(createMockMigration('c', '0.0.3'));
    const all = registry.getAll();
    expect(all.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined for unknown name', () => {
    expect(registry.getByName('unknown')).toBeUndefined();
  });

  it('returns undefined for unknown version', () => {
    expect(registry.getByVersion('9.9.9')).toBeUndefined();
  });
});

// Version utilities

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
  });

  it('returns -1 when a < b', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('compares minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
  });

  it('compares patch versions', () => {
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1);
  });
});

describe('isValidVersion', () => {
  it('accepts valid semver', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('0.0.1')).toBe(true);
    expect(isValidVersion('1.2.3-beta.1')).toBe(true);
  });

  it('rejects invalid versions', () => {
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion('abc')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isValidVersion('1')).toBe(false);
  });
});
