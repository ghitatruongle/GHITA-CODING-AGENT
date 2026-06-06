// ==============================================================================
// GHITA CODING AGENT - NutJS Desktop Operator (Phase 18: Screenshot Pipeline)
// ==============================================================================
//
// NutJSOperator is the production driver on Windows / macOS / Linux desktops.
// It defers ALL imports of @nut-tree/nut-js until the first method call so
// the package can be installed in CI / Docker images that don't have a
// display server without crashing on require. A failed import is reported
// via healthCheck() with a clear reason, and the ReAct loop is expected to
// fall back to the static mock screenshot pipeline.
//
// Threading model: nut.js is synchronous; we wrap each call in Promise.resolve
// so the ReAct loop (and the React UI) keep flowing. Mouse movement is
// throttled via nut.js's built-in pacing; we just expose the canonical async
// surface from the Operator contract.
// ==============================================================================

import type {
  Operator,
  OperatorCapabilities,
  OperatorContext,
  OperatorHealth,
} from './types.js';
import type { MouseButton, Point, ScreenCapture, ScreenSize } from '../index.js';
import {
  captureScreen,
  mockScreenshot,
  resizeIfNeeded,
  undoDpiScale,
} from './screenshot.js';

interface NutJsScreen {
  width?: number;
  height?: number;
  config?: { dpi?: number; scaleFactor?: number };
}

interface NutJsMouse {
  setPosition: (p: { x: number; y: number }) => Promise<void> | void;
  click: (button?: number) => Promise<void> | void;
  getPosition?: () => Promise<{ x: number; y: number }> | { x: number; y: number };
}

interface NutJsKeyboard {
  type: (text: string) => Promise<void> | void;
  pressKey: (...keys: string[]) => Promise<void> | void;
}

interface NutJsImageNS {
  readFromPath?: (p: string) => Promise<{ toBase64?: (mime: string) => Promise<string> }>;
  fromBase64?: (b: string) => Promise<unknown>;
}

interface NutJsModule {
  screen?: NutJsScreen;
  mouse?: NutJsMouse;
  keyboard?: NutJsKeyboard;
  image?: NutJsImageNS;
  Button?: { LEFT?: number; RIGHT?: number; MIDDLE?: number };
}

let cachedModule: NutJsModule | null = null;
let cachedError: Error | null = null;
let loadingPromise: Promise<NutJsModule> | null = null;

async function loadNutJs(): Promise<NutJsModule> {
  if (cachedModule) return cachedModule;
  if (cachedError) throw cachedError;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const mod = (await import('@nut-tree/nut-js')) as unknown as NutJsModule;
      cachedModule = mod;
      return mod;
    } catch (e) {
      cachedError = e as Error;
      throw cachedError;
    }
  })();
  return loadingPromise;
}

function buttonToNumber(button: MouseButton | undefined, mod: NutJsModule): number {
  if (!button) return 0;
  if (mod.Button) {
    switch (button) {
      case 'left':
        return mod.Button.LEFT ?? 0;
      case 'right':
        return mod.Button.RIGHT ?? 1;
      case 'middle':
        return mod.Button.MIDDLE ?? 2;
    }
  }
  return 0;
}

export class NutJSOperator implements Operator {
  readonly kind = 'nutjs' as const;
  private disposed = false;

  getCapabilities(): OperatorCapabilities {
    return {
      canScreenshot: true,
      canMouse: true,
      canKeyboard: true,
      supportsDpiScaling: true,
    };
  }

  async healthCheck(): Promise<OperatorHealth> {
    const checkedAt = Date.now();
    try {
      const mod = await loadNutJs();
      const screen = mod.screen;
      if (!screen || !mod.mouse || !mod.keyboard) {
        return {
          ready: false,
          kind: 'nutjs',
          checkedAt,
          reason: 'nut-js loaded but missing screen/mouse/keyboard exports',
        };
      }
      return { ready: true, kind: 'nutjs', checkedAt };
    } catch (e) {
      return {
        ready: false,
        kind: 'nutjs',
        checkedAt,
        reason: `nut-js unavailable: ${(e as Error).message}`,
      };
    }
  }

  async getScreenSize(): Promise<ScreenSize> {
    const mod = await loadNutJs();
    const w = mod.screen?.width ?? 0;
    const h = mod.screen?.height ?? 0;
    if (w <= 0 || h <= 0) {
      throw new Error('nut-js reported zero screen size; check display server');
    }
    return { width: w, height: h };
  }

  async screenshot(context?: OperatorContext): Promise<ScreenCapture> {
    if (this.disposed) throw new Error('NutJSOperator is disposed');

    let size: ScreenSize | undefined;
    try {
      const mod = await loadNutJs();
      size = { width: mod.screen?.width ?? 0, height: mod.screen?.height ?? 0 };
    } catch {
      size = undefined;
    }

    const raw = await captureScreen({ maxEdge: context?.maxEdge });
    const scaleFactor = context?.scaleFactor ?? 1.0;
    const adjusted = size && size.width > 0 ? undoDpiScale(size, scaleFactor) : size;
    return { ...raw, size: adjusted };
  }

  async moveMouse(point: Point): Promise<void> {
    if (this.disposed) throw new Error('NutJSOperator is disposed');
    const mod = await loadNutJs();
    if (!mod.mouse) throw new Error('nut-js mouse not available');
    await mod.mouse.setPosition({ x: Math.round(point.x), y: Math.round(point.y) });
  }

  async click(point?: Point, button?: MouseButton): Promise<void> {
    if (this.disposed) throw new Error('NutJSOperator is disposed');
    const mod = await loadNutJs();
    if (!mod.mouse) throw new Error('nut-js mouse not available');

    if (point) {
      await mod.mouse.setPosition({ x: Math.round(point.x), y: Math.round(point.y) });
    }
    await mod.mouse.click(buttonToNumber(button, mod));
  }

  async typeText(text: string): Promise<void> {
    if (this.disposed) throw new Error('NutJSOperator is disposed');
    if (typeof text !== 'string' || text.length === 0) return;
    const mod = await loadNutJs();
    if (!mod.keyboard) throw new Error('nut-js keyboard not available');
    await mod.keyboard.type(text);
  }

  async pressKey(key: string): Promise<void> {
    if (this.disposed) throw new Error('NutJSOperator is disposed');
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('pressKey requires a non-empty key name');
    }
    const mod = await loadNutJs();
    if (!mod.keyboard) throw new Error('nut-js keyboard not available');
    await mod.keyboard.pressKey(key);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

/**
 * Best-effort factory: returns a NutJSOperator if the native module is
 * available, otherwise returns null. The ReAct loop uses this to decide
 * whether to drive the real desktop or fall back to the static mock.
 */
export async function tryCreateNutJSOperator(): Promise<NutJSOperator | null> {
  const op = new NutJSOperator();
  const health = await op.healthCheck();
  return health.ready ? op : null;
}

/**
 * Build a model-bound screenshot bundle: capture + size + resize decision.
 * The ReAct loop calls this once per iteration and ships the result to
 * the multimodal LLM.
 */
export async function buildScreenshotBundle(
  operator: Operator,
  context?: OperatorContext,
): Promise<{
  capture: ScreenCapture;
  size: ScreenSize | undefined;
  resize: { needsResize: boolean; target: ScreenSize | undefined };
}> {
  const capture = await operator.screenshot(context);
  const resize = resizeIfNeeded(capture.size, context?.maxEdge);
  return { capture, size: capture.size, resize };
}

export { mockScreenshot };
