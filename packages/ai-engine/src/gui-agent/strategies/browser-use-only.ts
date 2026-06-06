/**
 * Phase 20 — Browser-Use-Only Control Strategy
 *
 * Uses Chrome DevTools Protocol (CDP) accessibility tree to drive a web
 * browser. Falls back to `getFullAXTree` when the element is not visible
 * to the accessibility tree. Pure CDP — no pixel clicks, no NutJS.
 */

export interface AxTreeNode {
  nodeId: string;
  role: string;
  name: string;
  value?: string;
  properties?: Array<{ name: string; value: unknown }>;
  children?: AxTreeNode[];
}

export interface BrowserTarget {
  /** URL the page is on */
  url: string;
  /** Title of the page */
  title: string;
  /** Full accessibility tree root */
  axTree: AxTreeNode;
  /** CDP tab/session id */
  sessionId: string;
}

export interface CdpAccessibilityClient {
  /** Returns the full accessibility tree for the active document. */
  getFullAXTree(sessionId: string): Promise<AxTreeNode>;
  /** Dispatches a synthetic input event via CDP. */
  dispatchInputEvent(
    sessionId: string,
    kind: 'mouseClick' | 'keyDown' | 'keyUp' | 'inputText',
    payload: Record<string, unknown>,
  ): Promise<void>;
  /** Navigates the page. */
  navigate(sessionId: string, url: string): Promise<void>;
  /** Closes the tab. */
  close(sessionId: string): Promise<void>;
}

export interface BrowserUseOnlyConfig {
  cdp: CdpAccessibilityClient;
  /** When true, route errors to a fallback selector (default: true). */
  axFallback?: boolean;
}

export type BrowserAction =
  | { type: 'click'; role: string; name: string }
  | { type: 'type'; role: string; name: string; text: string }
  | { type: 'press'; key: string }
  | { type: 'navigate'; url: string };

/**
 * Walk an accessibility tree and find a node by role + accessible name.
 * Performs a depth-first search, exact match on role + name.
 */
export function findByRoleAndName(
  root: AxTreeNode,
  role: string,
  name: string,
): AxTreeNode | null {
  if (root.role === role && root.name === name) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const found = findByRoleAndName(child, role, name);
    if (found) return found;
  }
  return null;
}

/**
 * BrowserUseOnlyStrategy — executes browser actions via the CDP accessibility
 * tree. When `axFallback` is enabled (default), the strategy walks the full
 * AX tree to locate elements that aren't returned by direct queries.
 */
export class BrowserUseOnlyStrategy {
  readonly name = 'browser-use-only' as const;
  private readonly cdp: CdpAccessibilityClient;
  private readonly axFallback: boolean;
  private activeSessionId: string | null = null;

  constructor(config: BrowserUseOnlyConfig) {
    this.cdp = config.cdp;
    this.axFallback = config.axFallback !== false;
  }

  /** Open a tab and snapshot the accessibility tree. */
  async open(target: { url: string; sessionId: string }): Promise<BrowserTarget> {
    this.activeSessionId = target.sessionId;
    await this.cdp.navigate(target.sessionId, target.url);
    const axTree = await this.cdp.getFullAXTree(target.sessionId);
    return { url: target.url, title: '', axTree, sessionId: target.sessionId };
  }

  async close(): Promise<void> {
    if (this.activeSessionId) {
      await this.cdp.close(this.activeSessionId);
      this.activeSessionId = null;
    }
  }

  /** Resolve a click target to an accessibility node, with AX-tree fallback. */
  private async resolveTarget(action: { role: string; name: string }): Promise<AxTreeNode> {
    if (!this.activeSessionId) {
      throw new Error('[browser-use-only] no active browser session');
    }
    const tree = await this.cdp.getFullAXTree(this.activeSessionId);
    const direct = findByRoleAndName(tree, action.role, action.name);
    if (direct) return direct;
    if (!this.axFallback) {
      throw new Error(
        `[browser-use-only] element not found: role="${action.role}" name="${action.name}"`,
      );
    }
    // Full AX tree is already returned; traverse it again recursively.
    const fullTree = await this.cdp.getFullAXTree(this.activeSessionId);
    const fallback = findByRoleAndName(fullTree, action.role, action.name);
    if (!fallback) {
      throw new Error(
        `[browser-use-only] element not found in full AX tree: role="${action.role}" name="${action.name}"`,
      );
    }
    return fallback;
  }

  async execute(action: BrowserAction): Promise<{ ok: true; node?: AxTreeNode }> {
    if (!this.activeSessionId) {
      throw new Error('[browser-use-only] no active browser session');
    }
    switch (action.type) {
      case 'click': {
        const node = await this.resolveTarget({ role: action.role, name: action.name });
        await this.cdp.dispatchInputEvent(this.activeSessionId, 'mouseClick', {
          nodeId: node.nodeId,
        });
        return { ok: true, node };
      }
      case 'type': {
        const node = await this.resolveTarget({ role: action.role, name: action.name });
        await this.cdp.dispatchInputEvent(this.activeSessionId, 'inputText', {
          nodeId: node.nodeId,
          text: action.text,
        });
        return { ok: true, node };
      }
      case 'press': {
        await this.cdp.dispatchInputEvent(this.activeSessionId, 'keyDown', { key: action.key });
        await this.cdp.dispatchInputEvent(this.activeSessionId, 'keyUp', { key: action.key });
        return { ok: true };
      }
      case 'navigate': {
        await this.cdp.navigate(this.activeSessionId, action.url);
        return { ok: true };
      }
    }
  }
}
