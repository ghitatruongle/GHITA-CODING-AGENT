/**

 *
 * Thin wrapper that implements the CdpAccessibilityClient interface over
 * a generic CDP transport (WebSocket / IPC). Used by the browser-use-only
 * and mixed strategies.
 *
 * Includes a Selenium-compatible fallback that drives a real browser
 * through WebDriver when CDP is unavailable. The fallback exposes
 * `getFullAXTree` via the WebDriver `GET /session/:id/accessibility/root`
 * endpoint, which mirrors CDP's full accessibility tree.
 */

import type { AxTreeNode, CdpAccessibilityClient } from './browser-use-only.js';

export interface CdpTransport {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * Default implementation of CdpAccessibilityClient over a generic CDP
 * transport. Uses standard DevTools Protocol methods:
 *   - Accessibility.getFullAXTree
 *   - Input.dispatchMouseEvent / Input.dispatchKeyEvent
 *   - Page.navigate
 *   - Target.closeTarget
 */
export class CdpAccessibilityAdapter implements CdpAccessibilityClient {
  constructor(private readonly transport: CdpTransport) {}

  async getFullAXTree(sessionId: string): Promise<AxTreeNode> {
    const raw = await this.transport.send<{ nodes?: RawAxNode[] }>('Accessibility.getFullAXTree', {
      sessionId,
    });
    return toAxTree(raw.nodes ?? []);
  }

  async dispatchInputEvent(
    sessionId: string,
    kind: 'mouseClick' | 'keyDown' | 'keyUp' | 'inputText',
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (kind === 'mouseClick') {
      const {
        x,
        y,
        button = 'left',
        clickCount = 1,
      } = payload as {
        x: number;
        y: number;
        button?: 'left' | 'right' | 'middle';
        clickCount?: number;
      };
      await this.transport.send('Input.dispatchMouseEvent', {
        sessionId,
        type: 'mousePressed',
        x,
        y,
        button,
        clickCount,
      });
      await this.transport.send('Input.dispatchMouseEvent', {
        sessionId,
        type: 'mouseReleased',
        x,
        y,
        button,
        clickCount,
      });
    } else if (kind === 'keyDown' || kind === 'keyUp') {
      await this.transport.send(
        kind === 'keyDown' ? 'Input.dispatchKeyEvent' : 'Input.dispatchKeyEvent',
        { sessionId, type: kind === 'keyDown' ? 'keyDown' : 'keyUp', ...payload },
      );
    } else if (kind === 'inputText') {
      const text = String(payload.text ?? '');
      for (const ch of text) {
        await this.transport.send('Input.dispatchKeyEvent', {
          sessionId,
          type: 'char',
          text: ch,
        });
      }
    }
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    await this.transport.send('Page.navigate', { sessionId, url });
  }

  async close(sessionId: string): Promise<void> {
    await this.transport.send('Target.closeTarget', { sessionId });
  }
}

// Raw CDP shape → AxTreeNode conversion

interface RawAxNode {
  nodeId: string;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string };
  properties?: Array<{ name: string; value: { value?: unknown } }>;
  childIds?: string[];
}

function toAxTree(nodes: RawAxNode[]): AxTreeNode {
  const byId = new Map<string, AxTreeNode>();
  for (const n of nodes) {
    byId.set(n.nodeId, {
      nodeId: n.nodeId,
      role: n.role?.value ?? '',
      name: n.name?.value ?? '',
      value: n.value?.value,
      properties: n.properties?.map((p) => ({ name: p.name, value: p.value?.value })),
      children: [],
    });
  }
  let root: AxTreeNode | null = null;
  for (const n of nodes) {
    const node = byId.get(n.nodeId);
    if (!node) continue;
    if (n.childIds && n.childIds.length > 0) {
      node.children = n.childIds
        .map((id) => byId.get(id))
        .filter((c): c is AxTreeNode => Boolean(c));
    }
    if (!root && n.role?.value) {
      root = node;
    }
  }
  return root ?? { nodeId: 'root', role: 'RootWebArea', name: '', children: [] };
}

// Selenium WebDriver fallback — implements getFullAXTree via W3C WebDriver

export interface WebDriverSession {
  sessionId: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
}

export interface WebDriverAccessibilityClientOptions {
  session: WebDriverSession;
}

/**
 * WebDriverAccessibilityClient — drives a real browser through W3C
 * WebDriver. Exposes the same surface as CdpAccessibilityClient so
 * the browser-use-only strategy can use it transparently.
 *
 * Used as a Selenium / webdriver_manager fallback when CDP isn't
 * available. The accessibility tree is fetched via the WebDriver
 * `GET /session/:id/accessibility/tree` endpoint.
 */
export class WebDriverAccessibilityClient implements CdpAccessibilityClient {
  constructor(private readonly options: WebDriverAccessibilityClientOptions) {}

  async getFullAXTree(sessionId: string): Promise<AxTreeNode> {
    const { baseUrl, fetchImpl } = this.options.session;
    const url = `${baseUrl}/session/${sessionId}/accessibility/tree`;
    const res = await fetchImpl(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`WebDriver accessibility error (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { value?: RawWebDriverAxNode[] };
    return webDriverTreeToAxTree(body.value ?? []);
  }

  async dispatchInputEvent(
    sessionId: string,
    kind: 'mouseClick' | 'keyDown' | 'keyUp' | 'inputText',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { baseUrl, fetchImpl } = this.options.session;
    const url = `${baseUrl}/session/${sessionId}/actions`;
    if (kind === 'mouseClick') {
      const {
        x,
        y,
        button = 'left',
      } = payload as {
        x: number;
        y: number;
        button?: string;
      };
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x, y },
                { type: 'pointerDown', button: Number(button === 'right' ? 2 : 0) },
                { type: 'pointerUp', button: Number(button === 'right' ? 2 : 0) },
              ],
            },
          ],
        }),
      });
    } else if (kind === 'keyDown' || kind === 'keyUp') {
      const key = String(payload.key ?? '');
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [
            {
              type: 'key',
              id: 'kbd',
              actions: [{ type: kind === 'keyDown' ? 'keyDown' : 'keyUp', value: key }],
            },
          ],
        }),
      });
    } else if (kind === 'inputText') {
      const text = String(payload.text ?? '');
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [
            { type: 'key', id: 'kbd', actions: [{ type: 'keyDown', value: text }] },
            { type: 'key', id: 'kbd', actions: [{ type: 'keyUp', value: text }] },
          ],
        }),
      });
    }
  }

  async navigate(sessionId: string, target: string): Promise<void> {
    const { baseUrl, fetchImpl } = this.options.session;
    const res = await fetchImpl(`${baseUrl}/session/${sessionId}/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
    });
    if (!res.ok) {
      throw new Error(`WebDriver navigate error (${res.status}): ${await res.text()}`);
    }
  }

  async close(sessionId: string): Promise<void> {
    const { baseUrl, fetchImpl } = this.options.session;
    await fetchImpl(`${baseUrl}/session/${sessionId}`, { method: 'DELETE' });
  }
}

interface RawWebDriverAxNode {
  [key: string]: unknown;
  'X-NodeId'?: string;
  role?: string;
  name?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: RawWebDriverAxNode[];
}

function webDriverTreeToAxTree(nodes: RawWebDriverAxNode[]): AxTreeNode {
  if (nodes.length === 0) {
    return { nodeId: 'root', role: 'RootWebArea', name: '', children: [] };
  }
  const convert = (n: RawWebDriverAxNode): AxTreeNode => {
    const properties = n.properties
      ? Object.entries(n.properties).map(([name, value]) => ({ name, value }))
      : undefined;
    return {
      nodeId: String(n['X-NodeId'] ?? Math.random().toString(36).slice(2)),
      role: n.role ?? '',
      name: n.name ?? '',
      value: n.value,
      properties,
      children: (n.children ?? []).map(convert),
    };
  };
  return convert(nodes[0] as RawWebDriverAxNode);
}
