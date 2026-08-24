import { describe, it, expect, beforeEach } from 'vitest';
import { LayoutPresetManager } from './layout-preset.js';

// Inline localStorage mock for Node test environment
function mockLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, val);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

beforeEach(() => {
  mockLocalStorage();
});

describe('LayoutPresetManager', () => {
  let manager: LayoutPresetManager;

  beforeEach(() => {
    manager = new LayoutPresetManager();
  });

  it('should start with no presets', () => {
    expect(manager.list()).toHaveLength(0);
  });

  it('should save a preset', () => {
    const preset = manager.save('Coding Layout', [
      { role: 'main', geometry: { x: 0, y: 0, width: 800, height: 600 }, visible: true },
    ]);
    expect(preset.id).toMatch(/^layout_/);
    expect(preset.name).toBe('Coding Layout');
    expect(manager.list()).toHaveLength(1);
  });

  it('should restore a preset', () => {
    const preset = manager.save('Test', [
      { role: 'main', geometry: { x: 100, y: 100, width: 800, height: 600 }, visible: true },
    ]);
    const restored = manager.restore(preset.id);
    expect(restored).toHaveLength(1);
    expect(restored?.[0]?.geometry.x).toBe(100);
  });

  it('should return null when restoring unknown preset', () => {
    expect(manager.restore('nonexistent')).toBeNull();
  });

  it('should rename a preset', () => {
    const preset = manager.save('Old Name', []);
    expect(manager.rename(preset.id, 'New Name')).toBe(true);
    expect(manager.get(preset.id)?.name).toBe('New Name');
  });

  it('should return false when renaming unknown preset', () => {
    expect(manager.rename('nonexistent', 'Test')).toBe(false);
  });

  it('should delete a preset', () => {
    const preset = manager.save('Test', []);
    expect(manager.delete(preset.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it('should return false when deleting unknown preset', () => {
    expect(manager.delete('nonexistent')).toBe(false);
  });

  it('should clear activeId when deleting active preset', () => {
    const preset = manager.save('Active', []);
    expect(manager.getActiveId()).toBe(preset.id);
    manager.delete(preset.id);
    expect(manager.getActiveId()).toBeNull();
  });

  it('should set active preset', () => {
    const preset = manager.save('Test', []);
    manager.setActive(null);
    expect(manager.getActiveId()).toBeNull();
    manager.setActive(preset.id);
    expect(manager.getActiveId()).toBe(preset.id);
  });

  it('should persist presets to localStorage', () => {
    manager.save('Persisted', []);
    // Create a new manager - it should load from localStorage
    const manager2 = new LayoutPresetManager();
    expect(manager2.list()).toHaveLength(1);
  });
});
