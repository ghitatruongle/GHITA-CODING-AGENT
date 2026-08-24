export type TabId = string;

export interface TabInfo {
  id: TabId;
  url: string;
  title: string;
  createdAt: number;
  lastActiveAt: number;
  /** When true, the tab's context is isolated (no shared cookies/storage). */
  isolated: boolean;
}

export interface TabStorage {
  load: (id: TabId) => Promise<Record<string, unknown> | null>;
  save: (id: TabId, state: Record<string, unknown>) => Promise<void>;
  remove: (id: TabId) => Promise<void>;
}

export interface TabSwitchHook {
  onActivate?: (tab: TabInfo) => void | Promise<void>;
  onClose?: (tab: TabInfo) => void | Promise<void>;
}

export class TabManager {
  private tabs = new Map<TabId, TabInfo>();
  private activeId: TabId | null = null;
  private readonly maxTabs: number;

  constructor(
    private readonly hooks: TabSwitchHook = {},
    private readonly storage?: TabStorage,
    options: { maxTabs?: number } = {},
  ) {
    this.maxTabs = options.maxTabs ?? 20;
  }

  list(): TabInfo[] {
    return Array.from(this.tabs.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  getActive(): TabInfo | null {
    return this.activeId ? (this.tabs.get(this.activeId) ?? null) : null;
  }

  async open(url: string, opts: { isolated?: boolean; title?: string } = {}): Promise<TabInfo> {
    if (this.tabs.size >= this.maxTabs) {
      const victim = this.list()
        .reverse()
        .find((t) => !t.isolated);
      if (victim) await this.close(victim.id);
    }
    const id = cryptoRandomId();
    const now = Date.now();
    const tab: TabInfo = {
      id,
      url,
      title: opts.title ?? url,
      createdAt: now,
      lastActiveAt: now,
      isolated: opts.isolated ?? false,
    };
    this.tabs.set(id, tab);
    await this.activate(id);
    return tab;
  }

  async activate(id: TabId): Promise<TabInfo | null> {
    const tab = this.tabs.get(id);
    if (!tab) return null;
    tab.lastActiveAt = Date.now();
    this.activeId = id;
    if (this.storage) {
      const state = await this.storage.load(id).catch(() => null);
      if (state) tab.title = (state['title'] as string) ?? tab.title;
    }
    await this.hooks.onActivate?.(tab);
    return tab;
  }

  async close(id: TabId): Promise<boolean> {
    const tab = this.tabs.get(id);
    if (!tab) return false;
    this.tabs.delete(id);
    if (this.activeId === id) {
      const remaining = this.list();
      this.activeId = remaining[0]?.id ?? null;
    }
    await this.storage?.remove(id).catch(() => undefined);
    await this.hooks.onClose?.(tab);
    return true;
  }

  async closeOthers(id: TabId): Promise<number> {
    const victims = this.list()
      .filter((t) => t.id !== id)
      .map((t) => t.id);
    for (const v of victims) await this.close(v);
    return victims.length;
  }

  async updateMeta(id: TabId, patch: Partial<Pick<TabInfo, 'url' | 'title'>>): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab) return;
    Object.assign(tab, patch);
    if (this.storage) {
      await this.storage.save(id, { title: tab.title, url: tab.url }).catch(() => undefined);
    }
  }

  async persistAll(): Promise<void> {
    if (!this.storage) return;
    for (const tab of this.tabs.values()) {
      await this.storage.save(tab.id, { title: tab.title, url: tab.url }).catch(() => undefined);
    }
  }
}

function cryptoRandomId(): TabId {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = 'tab_';
  for (let i = 0; i < 10; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/** In-memory storage adapter; useful for tests and as a default fallback. */
export class MemoryTabStorage implements TabStorage {
  private data = new Map<TabId, Record<string, unknown>>();
  async load(id: TabId) {
    return this.data.get(id) ?? null;
  }
  async save(id: TabId, state: Record<string, unknown>) {
    this.data.set(id, { ...state });
  }
  async remove(id: TabId) {
    this.data.delete(id);
  }
}
