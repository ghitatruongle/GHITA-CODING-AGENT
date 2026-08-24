import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShortcutRegistry } from './shortcut.js';

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry;

  beforeEach(() => {
    registry = new ShortcutRegistry();
  });

  it('should register and list bindings', () => {
    registry.register({
      accelerator: 'CmdOrCtrl+S',
      action: 'save',
      description: 'Save',
      enabled: true,
    });
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.accelerator).toBe('CmdOrCtrl+S');
  });

  it('should unregister bindings', () => {
    registry.register({ accelerator: 'CmdOrCtrl+S', action: 'save', enabled: true });
    expect(registry.unregister('CmdOrCtrl+S')).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it('should return false when unregistering unknown binding', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('should enable/disable bindings', () => {
    registry.register({ accelerator: 'CmdOrCtrl+S', action: 'save', enabled: true });
    registry.setEnabled('CmdOrCtrl+S', false);
    const list = registry.list();
    expect(list[0]?.enabled).toBe(false);
  });

  it('should trigger listeners on action', () => {
    const listener = vi.fn();
    registry.register({ accelerator: 'CmdOrCtrl+S', action: 'save', enabled: true });
    registry.onAction('CmdOrCtrl+S', listener);
    const result = registry.trigger('CmdOrCtrl+S');
    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should not trigger disabled bindings', () => {
    const listener = vi.fn();
    registry.register({ accelerator: 'CmdOrCtrl+S', action: 'save', enabled: false });
    registry.onAction('CmdOrCtrl+S', listener);
    expect(registry.trigger('CmdOrCtrl+S')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('should not trigger unknown bindings', () => {
    expect(registry.trigger('unknown')).toBe(false);
  });

  it('should unsubscribe listeners', () => {
    const listener = vi.fn();
    registry.register({ accelerator: 'CmdOrCtrl+S', action: 'save', enabled: true });
    const unsubscribe = registry.onAction('CmdOrCtrl+S', listener);
    unsubscribe();
    registry.trigger('CmdOrCtrl+S');
    expect(listener).not.toHaveBeenCalled();
  });

  describe('isValid', () => {
    it('should validate correct accelerators', () => {
      expect(ShortcutRegistry.isValid('CmdOrCtrl+S')).toBe(true);
      expect(ShortcutRegistry.isValid('Ctrl+Shift+A')).toBe(true);
      expect(ShortcutRegistry.isValid('Alt+F4')).toBe(true);
    });

    it('should reject invalid accelerators', () => {
      expect(ShortcutRegistry.isValid('')).toBe(false);
      expect(ShortcutRegistry.isValid('A')).toBe(false);
      expect(ShortcutRegistry.isValid('InvalidMod+X')).toBe(false);
    });
  });
});
