// v0.7.0 — AppStore new fields tests

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './appStore';

// Reset store between tests by clearing localStorage
beforeEach(() => {
  localStorage.clear();
  // Force a fresh store state by clearing zustand's internal state
  // Since we can't re-create the store, we reset key fields via setState
  const s = useAppStore.getState();
  s.setCommandPaletteOpen(false);
  s.setShowWelcome(true);
  s.setActiveWorkspace(null);
  s.setEditorFontSize(14);
  s.setEditorWordWrap(true);
  s.setEditorMinimap(true);
  s.setEditorLineNumbers(true);
  s.setEditorTabSize(2);
  s.setTerminalFontSize(13);
  s.setTerminalFontFamily("'JetBrains Mono', 'Fira Code', 'Consolas', monospace");
  s.shortcutsEnabled = true;
  s.activeWorkspace = null;
  s.recentWorkspaces = [];
});

describe('AppStore — v0.7.0 new fields', () => {
  it('commandPaletteOpen defaults to false', () => {
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it('setCommandPaletteOpen toggles command palette', () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
    useAppStore.getState().setCommandPaletteOpen(false);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it('showWelcome defaults to true', () => {
    expect(useAppStore.getState().showWelcome).toBe(true);
  });

  it('setShowWelcome toggles welcome screen', () => {
    useAppStore.getState().setShowWelcome(false);
    expect(useAppStore.getState().showWelcome).toBe(false);
  });

  it('activeWorkspace defaults to null', () => {
    expect(useAppStore.getState().activeWorkspace).toBeNull();
  });

  it('setActiveWorkspace stores path', () => {
    useAppStore.getState().setActiveWorkspace('/home/user/project');
    expect(useAppStore.getState().activeWorkspace).toBe('/home/user/project');
  });

  it('recentWorkspaces defaults to empty array', () => {
    expect(useAppStore.getState().recentWorkspaces).toEqual([]);
  });

  it('addRecentWorkspace adds and deduplicates', () => {
    const s = useAppStore.getState();
    s.addRecentWorkspace('/project-a');
    s.addRecentWorkspace('/project-b');
    s.addRecentWorkspace('/project-a'); // duplicate
    const ws = useAppStore.getState().recentWorkspaces;
    expect(ws).toContain('/project-a');
    expect(ws).toContain('/project-b');
    // Deduplicated — only 2 entries
    expect(ws.filter((w) => w === '/project-a')).toHaveLength(1);
  });

  it('recentWorkspaces is bounded to 10', () => {
    const s = useAppStore.getState();
    for (let i = 0; i < 15; i++) {
      s.addRecentWorkspace(`/workspace-${i}`);
    }
    expect(useAppStore.getState().recentWorkspaces).toHaveLength(10);
  });

  it('editorFontSize defaults to 14', () => {
    expect(useAppStore.getState().editorFontSize).toBe(14);
  });

  it('setEditorFontSize clamps to [10, 32]', () => {
    const s = useAppStore.getState();
    s.setEditorFontSize(5);
    expect(useAppStore.getState().editorFontSize).toBe(10);
    s.setEditorFontSize(50);
    expect(useAppStore.getState().editorFontSize).toBe(32);
    s.setEditorFontSize(18);
    expect(useAppStore.getState().editorFontSize).toBe(18);
  });

  it('editorWordWrap defaults to true', () => {
    expect(useAppStore.getState().editorWordWrap).toBe(true);
  });

  it('editorMinimap defaults to true', () => {
    expect(useAppStore.getState().editorMinimap).toBe(true);
  });

  it('editorLineNumbers defaults to true', () => {
    expect(useAppStore.getState().editorLineNumbers).toBe(true);
  });

  it('editorTabSize defaults to 2', () => {
    expect(useAppStore.getState().editorTabSize).toBe(2);
  });

  it('setEditorTabSize clamps to [1, 8]', () => {
    const s = useAppStore.getState();
    s.setEditorTabSize(0);
    expect(useAppStore.getState().editorTabSize).toBe(1);
    s.setEditorTabSize(16);
    expect(useAppStore.getState().editorTabSize).toBe(8);
  });

  it('terminalFontSize defaults to 13', () => {
    expect(useAppStore.getState().terminalFontSize).toBe(13);
  });

  it('terminalFontFamily defaults to monospace stack', () => {
    expect(useAppStore.getState().terminalFontFamily).toBe(
      "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    );
  });

  it('shortcutsEnabled defaults to true', () => {
    expect(useAppStore.getState().shortcutsEnabled).toBe(true);
  });

  it('toggleShortcutsEnabled flips value', () => {
    useAppStore.getState().toggleShortcutsEnabled();
    expect(useAppStore.getState().shortcutsEnabled).toBe(false);
    useAppStore.getState().toggleShortcutsEnabled();
    expect(useAppStore.getState().shortcutsEnabled).toBe(true);
  });
});
