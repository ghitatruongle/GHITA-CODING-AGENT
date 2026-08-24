import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager } from './theme.js';

describe('ThemeManager', () => {
  let manager: ThemeManager;

  beforeEach(() => {
    manager = new ThemeManager();
  });

  it('should have auto theme by default', () => {
    expect(manager.getConfig().kind).toBe('auto');
  });

  it('should resolve auto to light when no media query', () => {
    expect(manager.getResolved()).toBe('light');
  });

  it('should resolve auto to dark when media query matches', () => {
    manager.setMediaQuery({ matches: true });
    expect(manager.getResolved()).toBe('dark');
  });

  it('should switch theme kind', () => {
    manager.setKind('dark');
    expect(manager.getConfig().kind).toBe('dark');
    expect(manager.getResolved()).toBe('dark');
  });

  it('should be a no-op when setting same kind', () => {
    const listener = vi.fn();
    manager.onChange(listener);
    manager.setKind('auto');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should set accent color', () => {
    manager.setAccent('#ff0000');
    expect(manager.getConfig().accent).toBe('#ff0000');
  });

  it('should throw on invalid accent', () => {
    expect(() => manager.setAccent('red')).toThrow('Invalid hex color');
    expect(() => manager.setAccent('#fff')).toThrow('Invalid hex color');
  });

  it('should set font size within valid range', () => {
    manager.setFontSize(16);
    expect(manager.getConfig().fontSize).toBe(16);
  });

  it('should throw on invalid font size', () => {
    expect(() => manager.setFontSize(4)).toThrow('Font size must be');
    expect(() => manager.setFontSize(40)).toThrow('Font size must be');
  });

  it('should emit change events', () => {
    const listener = vi.fn();
    manager.onChange(listener);
    manager.setKind('dark');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dark' }));
  });

  it('should unsubscribe change listeners', () => {
    const listener = vi.fn();
    const unsubscribe = manager.onChange(listener);
    unsubscribe();
    manager.setKind('dark');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should generate CSS custom properties', () => {
    manager.setKind('dark');
    manager.setAccent('#ff6600');
    const vars = manager.toCssVars();
    expect(vars['--ghita-accent']).toBe('#ff6600');
    expect(vars['--ghita-theme']).toBe('dark');
    expect(vars['--ghita-font-size']).toBe('14px');
  });
});
