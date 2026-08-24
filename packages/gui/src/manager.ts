import { randomUUID } from 'node:crypto';
import type { WindowRole, WindowSpec, PersistedWindow } from './types.js';
import { WindowStateStore } from './persistence.js';

/**
 * Tracks logical windows (main/chat/settings/agent/logs) the Tauri shell can spawn.
 * Persists state across restarts via the WindowStateStore.
 */
export class WindowManager {
  private open = new Map<WindowRole, PersistedWindow>();
  private store: WindowStateStore;

  constructor(store: WindowStateStore = new WindowStateStore()) {
    this.store = store;
    const restored = this.store.load();
    for (const w of restored) this.open.set(w.role, w);
  }

  /**
   * Register / update a window's persisted state.
   */
  track(spec: WindowSpec): PersistedWindow {
    const existing = this.open.get(spec.role);
    const w: PersistedWindow = {
      role: spec.role,
      label: spec.label,
      geometry: existing?.geometry ?? spec.geometry,
      visible: existing?.visible ?? true,
      lastFocusedAt: existing?.lastFocusedAt ?? Date.now(),
    };
    this.open.set(spec.role, w);
    this.store.save(Array.from(this.open.values()));
    return w;
  }

  /**
   * Mark a window as focused.
   */
  focus(role: WindowRole): void {
    const w = this.open.get(role);
    if (w) {
      w.lastFocusedAt = Date.now();
      w.visible = true;
      this.store.save(Array.from(this.open.values()));
    }
  }

  /**
   * Mark a window as hidden / closed.
   */
  hide(role: WindowRole): void {
    const w = this.open.get(role);
    if (w) {
      w.visible = false;
      this.store.save(Array.from(this.open.values()));
    }
  }

  /**
   * Update geometry (called on resize/move).
   */
  updateGeometry(role: WindowRole, geometry: PersistedWindow['geometry']): void {
    const w = this.open.get(role);
    if (w) {
      w.geometry = geometry;
      this.store.save(Array.from(this.open.values()));
    }
  }

  /**
   * List all open windows.
   */
  list(): PersistedWindow[] {
    return Array.from(this.open.values());
  }

  /**
   * Get a specific window.
   */
  get(role: WindowRole): PersistedWindow | undefined {
    return this.open.get(role);
  }

  /**
   * Generate a unique label for a new window.
   */
  static newLabel(role: WindowRole): string {
    return `${role}-${randomUUID().slice(0, 8)}`;
  }
}
