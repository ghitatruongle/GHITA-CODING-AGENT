// ==============================================================================
// GHITA CODING AGENT - Layout Preset System (Phase 33)
// Save/load/switch workspace layouts
// ==============================================================================

import type { WindowGeometry, WindowRole } from './types.js';

/** A single window position within a layout preset */
export interface LayoutWindowEntry {
  role: WindowRole;
  geometry: WindowGeometry;
  visible: boolean;
}

/** A named layout preset (e.g. "coding", "debugging", "presentation") */
export interface LayoutPreset {
  id: string;
  name: string;
  windows: LayoutWindowEntry[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'ghita_layout_presets';

/**
 * Manages named layout presets that capture the position/size/visibility of all
 * open windows. Users can save, restore, rename, and delete presets.
 */
export class LayoutPresetManager {
  private presets = new Map<string, LayoutPreset>();
  private activeId: string | null = null;

  constructor() {
    this.load();
  }

  /** List all saved presets. */
  list(): LayoutPreset[] {
    return Array.from(this.presets.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get a specific preset by ID. */
  get(id: string): LayoutPreset | undefined {
    return this.presets.get(id);
  }

  /** Get the currently active preset ID. */
  getActiveId(): string | null {
    return this.activeId;
  }

  /** Save the current window layout as a named preset. */
  save(name: string, windows: LayoutWindowEntry[], id?: string): LayoutPreset {
    const presetId = id ?? `layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const existing = this.presets.get(presetId);
    const preset: LayoutPreset = {
      id: presetId,
      name,
      windows: structuredClone(windows),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    this.presets.set(presetId, preset);
    this.activeId = presetId;
    this.persist();
    return preset;
  }

  /** Restore a preset's window layout. Returns the window entries. */
  restore(id: string): LayoutWindowEntry[] | null {
    const preset = this.presets.get(id);
    if (!preset) return null;
    this.activeId = id;
    this.persist();
    return structuredClone(preset.windows);
  }

  /** Rename a preset. */
  rename(id: string, newName: string): boolean {
    const preset = this.presets.get(id);
    if (!preset) return false;
    preset.name = newName;
    preset.updatedAt = Date.now();
    this.persist();
    return true;
  }

  /** Delete a preset. */
  delete(id: string): boolean {
    if (!this.presets.has(id)) return false;
    this.presets.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.persist();
    return true;
  }

  /** Set the active preset without restoring. */
  setActive(id: string | null): void {
    this.activeId = id;
    this.persist();
  }

  private persist(): void {
    try {
      const data = {
        presets: Object.fromEntries(this.presets),
        activeId: this.activeId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may not be available in some contexts
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        presets: Record<string, LayoutPreset>;
        activeId: string | null;
      };
      for (const [id, preset] of Object.entries(data.presets ?? {})) {
        this.presets.set(id, preset);
      }
      this.activeId = data.activeId ?? null;
    } catch {
      // ignore
    }
  }
}
