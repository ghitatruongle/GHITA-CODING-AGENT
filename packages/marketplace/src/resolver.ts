// ==============================================================================
// GHITA CODING AGENT - Dependency Resolver (Phase 31)
// Resolves plugin dependency trees with conflict detection
// ==============================================================================

import { compareSemver, satisfiesRange } from './manifest.js';
import type { ResolvedDependency, DependencyGraph, DependencyConflict, PluginManifest } from './types.js';

/**
 * Resolve all dependencies for a set of root plugins.
 * Uses topological ordering with conflict detection.
 */
export function resolveDependencies(
  roots: PluginManifest[],
  registry: Map<string, PluginManifest[]>,
): DependencyGraph {
  const resolved = new Map<string, string>();
  const conflicts: DependencyConflict[] = [];
  const visited = new Set<string>();
  const queue: Array<{ name: string; range: string; requestedBy: string; transitive: boolean }> = [];

  // Seed queue from root plugins
  for (const root of roots) {
    resolved.set(root.id, root.version);
    visited.add(root.id);

    const deps = root.dependencies ?? {};
    for (const [depName, depRange] of Object.entries(deps)) {
      queue.push({ name: depName, range: depRange, requestedBy: root.id, transitive: false });
    }
  }

  // BFS resolution
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const existing = resolved.get(item.name);

    if (existing) {
      // Check if existing version satisfies new range
      if (!satisfiesRange(existing, item.range)) {
        conflicts.push({
          package: item.name,
          requested: [
            { by: item.requestedBy, range: item.range },
            { by: 'existing', range: existing },
          ],
        });
      }
      continue;
    }

    // Find best version from registry
    const candidates = registry.get(item.name);
    if (!candidates || candidates.length === 0) {
      conflicts.push({
        package: item.name,
        requested: [{ by: item.requestedBy, range: item.range }],
      });
      continue;
    }

    // Sort descending and pick the highest satisfying version
    const sorted = [...candidates].sort((a, b) => compareSemver(b.version, a.version));
    const best = sorted.find((c) => satisfiesRange(c.version, item.range));

    if (!best) {
      conflicts.push({
        package: item.name,
        requested: [{ by: item.requestedBy, range: item.range }],
      });
      continue;
    }

    resolved.set(item.name, best.version);

    // Add transitive dependencies
    if (best.dependencies) {
      for (const [depName, depRange] of Object.entries(best.dependencies)) {
        queue.push({ name: depName, range: depRange, requestedBy: item.name, transitive: true });
      }
    }
  }

  return {
    root: roots[0]?.id ?? 'unknown',
    resolved,
    conflicts,
  };
}

/**
 * Build a flat resolved dependency list from a graph.
 */
export function flattenResolution(graph: DependencyGraph): ResolvedDependency[] {
  const result: ResolvedDependency[] = [];
  for (const [name, version] of graph.resolved) {
    result.push({
      name,
      version,
      registry: 'default',
      transitive: name !== graph.root,
      dependencies: [],
    });
  }
  return result;
}

/**
 * Check if a dependency graph has any unresolved conflicts.
 */
export function hasConflicts(graph: DependencyGraph): boolean {
  return graph.conflicts.length > 0;
}

/**
 * Attempt to resolve conflicts by finding compatible versions.
 * Returns updated conflicts list (empty if all resolved).
 */
export function resolveConflicts(
  graph: DependencyGraph,
  registry: Map<string, PluginManifest[]>,
): DependencyConflict[] {
  const remaining: DependencyConflict[] = [];

  for (const conflict of graph.conflicts) {
    const candidates = registry.get(conflict.package);
    if (!candidates) {
      remaining.push(conflict);
      continue;
    }

    // Find a version that satisfies ALL requested ranges
    const sorted = [...candidates].sort((a, b) => compareSemver(b.version, a.version));
    const universal = sorted.find((c) =>
      conflict.requested.every((req) => satisfiesRange(c.version, req.range)),
    );

    if (universal) {
      graph.resolved.set(conflict.package, universal.version);
      conflict.resolved = universal.version;
    } else {
      remaining.push(conflict);
    }
  }

  return remaining;
}

/**
 * Detect circular dependencies in a plugin set.
 * Returns array of cycles found (each cycle is a list of plugin IDs).
 */
export function detectCircularDependencies(
  plugins: PluginManifest[],
): string[][] {
  const adj = new Map<string, string[]>();
  for (const p of plugins) {
    const deps = Object.keys(p.dependencies ?? {});
    adj.set(p.id, deps);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) ?? [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path]);
    }

    inStack.delete(node);
  }

  for (const p of plugins) {
    if (!visited.has(p.id)) {
      dfs(p.id, []);
    }
  }

  return cycles;
}
