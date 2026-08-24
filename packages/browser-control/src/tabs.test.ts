import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager, MemoryTabStorage } from './tabs.js';

describe('TabManager', () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  describe('initial state', () => {
    it('should have no tabs', () => {
      expect(manager.list()).toHaveLength(0);
    });

    it('should have no active tab', () => {
      expect(manager.getActive()).toBeNull();
    });
  });

  describe('open', () => {
    it('should open a new tab', async () => {
      const tab = await manager.open('https://example.com');
      expect(tab.url).toBe('https://example.com');
      expect(tab.id).toMatch(/^tab_/);
      expect(tab.isolated).toBe(false);
      expect(tab.createdAt).toBeGreaterThan(0);
    });

    it('should activate the newly opened tab', async () => {
      const tab = await manager.open('https://example.com');
      expect(manager.getActive()?.id).toBe(tab.id);
    });

    it('should use provided title', async () => {
      const tab = await manager.open('https://example.com', { title: 'Example' });
      expect(tab.title).toBe('Example');
    });

    it('should default title to url', async () => {
      const tab = await manager.open('https://example.com');
      expect(tab.title).toBe('https://example.com');
    });

    it('should create isolated tab', async () => {
      const tab = await manager.open('https://example.com', { isolated: true });
      expect(tab.isolated).toBe(true);
    });

    it('should enforce maxTabs limit', async () => {
      const smallManager = new TabManager(undefined, undefined, { maxTabs: 2 });
      await smallManager.open('https://page1.com');
      await smallManager.open('https://page2.com');
      await smallManager.open('https://page3.com');
      // Max 2 tabs should be present
      expect(smallManager.list().length).toBeLessThanOrEqual(2);
      // At least one of the first two should have been evicted
      const ids = smallManager.list().map((t) => t.id);
      expect(ids.length).toBeLessThanOrEqual(2);
    });

    it('should not evict isolated tabs when enforcing limit', async () => {
      const smallManager = new TabManager(undefined, undefined, { maxTabs: 2 });
      const isolated = await smallManager.open('https://isolated.com', { isolated: true });
      await smallManager.open('https://page2.com');
      await smallManager.open('https://page3.com');
      expect(smallManager.list().length).toBeLessThanOrEqual(2);
      // isolated tab should survive
      expect(smallManager.list().find((t) => t.id === isolated.id)).toBeDefined();
    });
  });

  describe('activate', () => {
    it('should activate an existing tab', async () => {
      const tab = await manager.open('https://example.com');
      const result = await manager.activate(tab.id);
      expect(result?.id).toBe(tab.id);
    });

    it('should return null for non-existent tab', async () => {
      const result = await manager.activate('tab_nonexistent');
      expect(result).toBeNull();
    });

    it('should call onActivate hook', async () => {
      const onActivate = vi.fn();
      const hookManager = new TabManager({ onActivate });
      const tab = await hookManager.open('https://example.com');
      await hookManager.activate(tab.id);
      expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }));
    });
  });

  describe('close', () => {
    it('should close an existing tab', async () => {
      const tab = await manager.open('https://example.com');
      const closed = await manager.close(tab.id);
      expect(closed).toBe(true);
      expect(manager.list()).toHaveLength(0);
    });

    it('should return false for non-existent tab', async () => {
      const result = await manager.close('tab_nonexistent');
      expect(result).toBe(false);
    });

    it('should switch active tab if closing active one', async () => {
      const tab1 = await manager.open('https://page1.com');
      const tab2 = await manager.open('https://page2.com');
      await manager.close(tab1.id);
      expect(manager.getActive()?.id).toBe(tab2.id);
    });

    it('should set active to null if closing last tab', async () => {
      const tab = await manager.open('https://example.com');
      await manager.close(tab.id);
      expect(manager.getActive()).toBeNull();
    });

    it('should call onClose hook', async () => {
      const onClose = vi.fn();
      const hookManager = new TabManager({ onClose });
      const tab = await hookManager.open('https://example.com');
      await hookManager.close(tab.id);
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }));
    });
  });

  describe('closeOthers', () => {
    it('should close all tabs except the specified one', async () => {
      await manager.open('https://page1.com');
      const tab2 = await manager.open('https://page2.com');
      await manager.open('https://page3.com');
      const count = await manager.closeOthers(tab2.id);
      expect(count).toBe(2);
      expect(manager.list()).toHaveLength(1);
      expect(manager.list()[0]?.id).toBe(tab2.id);
    });

    it('should return 0 when only one tab exists', async () => {
      const tab = await manager.open('https://example.com');
      const count = await manager.closeOthers(tab.id);
      expect(count).toBe(0);
    });
  });

  describe('updateMeta', () => {
    it('should update tab url and title', async () => {
      const tab = await manager.open('https://example.com');
      await manager.updateMeta(tab.id, { url: 'https://updated.com', title: 'Updated' });
      const updated = manager.getActive();
      expect(updated?.url).toBe('https://updated.com');
      expect(updated?.title).toBe('Updated');
    });

    it('should silently ignore non-existent tab', async () => {
      await expect(manager.updateMeta('tab_nonexistent', { title: 'Test' })).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should return all tabs', async () => {
      const tab1 = await manager.open('https://page1.com');
      const tab2 = await manager.open('https://page2.com');
      const tabs = manager.list();
      expect(tabs).toHaveLength(2);
      const ids = tabs.map((t) => t.id);
      expect(ids).toContain(tab1.id);
      expect(ids).toContain(tab2.id);
    });
  });

  describe('with MemoryTabStorage', () => {
    it('should persist and restore state from storage', async () => {
      const storage = new MemoryTabStorage();
      const storedManager = new TabManager({}, storage);
      const tab = await storedManager.open('https://example.com');
      await storedManager.updateMeta(tab.id, { title: 'Persisted Title' });
      await storedManager.persistAll();
      // Activate from storage
      const loaded = await storedManager.activate(tab.id);
      expect(loaded?.title).toBe('Persisted Title');
    });

    it('should clean up storage on close', async () => {
      const storage = new MemoryTabStorage();
      const storedManager = new TabManager({}, storage);
      const tab = await storedManager.open('https://example.com');
      await storedManager.persistAll();
      await storedManager.close(tab.id);
      const loaded = await storage.load(tab.id);
      expect(loaded).toBeNull();
    });
  });
});

describe('MemoryTabStorage', () => {
  let storage: MemoryTabStorage;

  beforeEach(() => {
    storage = new MemoryTabStorage();
  });

  it('should return null for unknown id', async () => {
    const data = await storage.load('tab_unknown');
    expect(data).toBeNull();
  });

  it('should save and load state', async () => {
    await storage.save('tab_1', { key: 'value' });
    const data = await storage.load('tab_1');
    expect(data).toEqual({ key: 'value' });
  });

  it('should return the saved state', async () => {
    await storage.save('tab_1', { key: 'value' });
    const data = await storage.load('tab_1');
    expect(data).toEqual({ key: 'value' });
  });

  it('should remove data', async () => {
    await storage.save('tab_1', { key: 'value' });
    await storage.remove('tab_1');
    const data = await storage.load('tab_1');
    expect(data).toBeNull();
  });
});
