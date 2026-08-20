// ==============================================================================
// GHITA CODING AGENT - Native addon bridge (v1.1.0 Track 8 A2)
// ==============================================================================
// Native-first with JS fallback: `loadNative(name)` resolves a compiled napi
// addon (crates/<name>/target/release/index.node, or a caller-registered
// addon), returning the JS fallback when the addon is not built. Mirrors the
// `memory/semantic/rustAddon.ts` pattern across all Track 8 modules.
// ==============================================================================

import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Non-Node environments (browser/WebView/happy-dom tests) do not have a
// file:-scheme import.meta.url; createRequire/fileURLToPath would throw at
// module scope. Degrade to a null require + empty root so loadNative falls
// back to the JS implementation instead of crashing on import.
let requireFn: ((id: string) => unknown) | null = null;
let repoRoot = '';
try {
  const requireAt = createRequire(import.meta.url);
  requireFn = (id) => requireAt(id);
  const here = fileURLToPath(new URL('.', import.meta.url));
  /** Monorepo root: packages/native-bridge/dist → ../../.. */
  repoRoot = resolve(here, '..', '..', '..');
} catch {
  requireFn = null;
  repoRoot = '';
}

export interface NativeModule {
  /** True when the native addon is loaded (false → using JS fallback). */
  native: boolean;
  /** The native module or the JS fallback implementation. */
  impl: unknown;
  /** Reason when falling back. */
  fallbackReason?: string;
}

const registered = new Map<string, unknown>();

/** Register a pre-loaded native module (e.g. compiled via napi-rs). */
export function registerNative(name: string, module: unknown): void {
  registered.set(name, module);
}

/** Remove a registered native module (test isolation). */
export function unregisterNative(name: string): void {
  registered.delete(name);
}

/** Candidate addon paths for a crate (incl. platform-named *.node outputs). */
export function addonCandidates(name: string): string[] {
  const candidates = [
    join(repoRoot, 'crates', name, 'target', 'release', 'index.node'),
    join(repoRoot, 'crates', name, 'index.node'),
    join(repoRoot, 'crates', name, 'target', 'debug', 'index.node'),
  ];
  // Any *.node emitted directly in the crate dir (e.g. secscan.win32-x64-gnu.node).
  for (const dir of [
    join(repoRoot, 'crates', name),
    join(repoRoot, 'crates', name, 'target', 'release'),
  ]) {
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.node')) candidates.push(join(dir, file));
      }
    } catch {
      // dir missing — skip
    }
  }
  return candidates;
}

/**
 * Load a native addon by name; returns the fallback when unavailable.
 * Example: `loadNative('secscan', jsFallback)`.
 */
export function loadNative<T>(name: string, fallback: T): NativeModule & { impl: T } {
  if (registered.has(name)) {
    return { native: true, impl: registered.get(name) as T };
  }
  for (const candidate of addonCandidates(name)) {
    if (!existsSync(candidate) || !requireFn) continue;
    try {
      // .node is CJS; require() it directly.
      const mod = requireFn(candidate) as T;
      registered.set(name, mod);
      return { native: true, impl: mod };
    } catch {
      // fall through to the next candidate / fallback
    }
  }
  return {
    native: false,
    impl: fallback,
    fallbackReason: `native addon "${name}" not built (crates/${name}/target/release/index.node missing)`,
  };
}

/** True when any addon candidate file exists on disk. */
export function isAddonBuilt(name: string): boolean {
  return addonCandidates(name).some((c) => existsSync(c));
}

export const NATIVE_BRIDGE_VERSION = '1.1.5-beta1';
