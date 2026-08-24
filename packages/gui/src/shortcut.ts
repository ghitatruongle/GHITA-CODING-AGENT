import type { ShortcutBinding } from './types.js';

/**
 * Registers and resolves global keyboard shortcuts. Tauri/electron wires
 * accelerator strings to OS-level events; this module owns the registry.
 */
export class ShortcutRegistry {
  private bindings = new Map<string, ShortcutBinding>();
  private listeners = new Map<string, Set<() => void>>();

  /**
   * Register or replace a binding.
   */
  register(binding: ShortcutBinding): void {
    this.bindings.set(binding.accelerator, binding);
  }

  /**
   * Unregister a binding.
   */
  unregister(accelerator: string): boolean {
    return this.bindings.delete(accelerator);
  }

  /**
   * Enable / disable a binding without removing it.
   */
  setEnabled(accelerator: string, enabled: boolean): void {
    const b = this.bindings.get(accelerator);
    if (b) b.enabled = enabled;
  }

  /**
   * Subscribe to a shortcut's action event.
   */
  onAction(accelerator: string, listener: () => void): () => void {
    if (!this.listeners.has(accelerator)) this.listeners.set(accelerator, new Set());
    this.listeners.get(accelerator)?.add(listener);
    return () => this.listeners.get(accelerator)?.delete(listener);
  }

  /**
   * Simulate triggering a shortcut (for tests / programmatic invocation).
   */
  trigger(accelerator: string): boolean {
    const b = this.bindings.get(accelerator);
    if (!b || !b.enabled) return false;
    for (const l of this.listeners.get(accelerator) ?? []) {
      try {
        l();
      } catch {
        // ignore
      }
    }
    return true;
  }

  /**
   * List all bindings.
   */
  list(): ShortcutBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Validate an accelerator string (basic format check).
   */
  static isValid(accelerator: string): boolean {
    if (!accelerator) return false;
    const parts = accelerator.split('+').map((p) => p.trim());
    if (parts.length < 2) return false;
    const validMods = new Set(['Cmd', 'Ctrl', 'CmdOrCtrl', 'Alt', 'Shift', 'Super', 'Meta']);
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    if (!key || key.length === 0) return false;
    for (const m of mods) if (!validMods.has(m)) return false;
    return true;
  }
}
