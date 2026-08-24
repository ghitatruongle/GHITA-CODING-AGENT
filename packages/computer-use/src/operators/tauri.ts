//
// TauriOperator is the production desktop driver that delegates ALL native
// operations to the Rust backend compiled into the Tauri binary. Compared to
// the legacy NutJSOperator it:
//
//   - Captures screenshots via native GDI / DXGI (~10-30 ms vs ~500 ms)
//   - Controls mouse & keyboard via native SendInput (sub-ms vs blocking nut.js)
//   - Resizes images via the Rust `image` crate Lanczos3 filter (~5 ms)
//   - Never blocks the JS event loop (no synchronous nut.js calls)
//   - Eliminates the @nut-tree/nut-js native binary dependency
//
// The operator implements the same `Operator` interface as NutJSOperator and
// MobileAdbOperator so the ReAct loop and ComputerUseController work unchanged.
//
// Usage:
//   import { TauriOperator, isTauriAvailable } from './tauri.js';
//
//   if (await isTauriAvailable()) {
//     const op = new TauriOperator();
//     const capture = await op.screenshot({ maxEdge: 1920 });
//   }

import type {
  Operator,
  OperatorCapabilities,
  OperatorContext,
  OperatorHealth,
  OperatorKind,
} from './types.js';
import type {
  ComputerUseAdapter,
  MouseButton,
  Point,
  ScreenCapture,
  ScreenSize,
} from '../index.js';
import { undoDpiScale } from './utils.js';

// Tauri IPC bridge

/**
 * Thin wrapper around Tauri's invoke that gracefully handles the case where
 * the Tauri runtime is unavailable (e.g. running in a browser or CI).
 *
 * Uses dynamic import to avoid requiring @tauri-apps/api as a build-time
 * dependency of this package. At runtime inside Tauri, the module is provided
 * by the WebView bridge.
 */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Access Tauri's IPC through the window global to avoid a hard dependency
  // on @tauri-apps/api. This works because Tauri injects __TAURI__ into the
  // WebView at startup.
  const tauri = (
    globalThis as unknown as { __TAURI__?: { invoke: (...args: unknown[]) => Promise<unknown> } }
  ).__TAURI__;
  if (!tauri?.invoke) {
    throw new Error(
      `Tauri invoke('${cmd}') failed: __TAURI__ global not found. ` +
        `Ensure the app is running inside the Tauri WebView.`,
    );
  }
  return tauri.invoke(cmd, args) as Promise<T>;
}

/**
 * Check whether the Tauri runtime is available and the Rust computer-use
 * backend responds to health checks.
 */
export async function isTauriAvailable(): Promise<boolean> {
  try {
    if (
      typeof window === 'undefined' ||
      !(window as unknown as { __TAURI__?: unknown }).__TAURI__
    ) {
      return false;
    }
    const health = await invoke<{ ready: boolean }>('computer_health_check');
    return health?.ready === true;
  } catch {
    return false;
  }
}

// TauriOperator

export class TauriOperator implements Operator {
  readonly kind: OperatorKind = 'nutjs' as const; // re-use 'nutjs' kind for compat
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
      const result = await invoke<OperatorHealth>('computer_health_check');
      return { ...result, checkedAt, kind: 'tauri' };
    } catch (e) {
      return {
        ready: false,
        kind: 'tauri',
        checkedAt,
        reason: `Tauri backend unavailable: ${(e as Error).message}`,
      };
    }
  }

  async getScreenSize(): Promise<ScreenSize> {
    if (this.disposed) throw new Error('TauriOperator is disposed');
    const size = await invoke<ScreenSize>('computer_get_screen_size');
    if (size.width <= 0 || size.height <= 0) {
      throw new Error('Rust backend reported zero screen size; check display server');
    }
    return size;
  }

  /**
   * Capture a screenshot of the primary display.
   *
   * The Rust backend handles:
   *   1. Native screen capture via GDI/DXGI/screencapture/X11
   *   2. Optional resize to `context.maxEdge` via Lanczos3
   *   3. PNG (or JPEG) encoding + base64
   *
   * After receiving the capture, we apply `undoDpiScale()` with the OS
   * scale factor (returned by Rust) to match NutJSOperator's behaviour on
   * HiDPI displays — the ReAct loop expects logical coordinates consistent
   * with getScreenSize().
   */
  async screenshot(context?: OperatorContext): Promise<ScreenCapture> {
    if (this.disposed) throw new Error('TauriOperator is disposed');

    const args: Record<string, unknown> = {};
    if (context?.maxEdge != null) {
      args.maxEdge = context.maxEdge;
    }

    const raw = await invoke<ScreenCapture & { scale_factor?: number }>(
      'computer_screenshot',
      args,
    );

    // Apply DPI scale adjustment to match NutJSOperator behaviour:
    // On HiDPI displays, the capture size is in physical pixels but the
    // ReAct loop works in logical (OS) coordinates.
    const scaleFactor = context?.scaleFactor ?? raw.scale_factor ?? 1.0;
    const adjusted = raw.size ? undoDpiScale(raw.size, scaleFactor) : raw.size;
    return { mimeType: raw.mimeType, data: raw.data, size: adjusted };
  }

  async moveMouse(point: Point): Promise<void> {
    if (this.disposed) throw new Error('TauriOperator is disposed');
    await invoke<void>('computer_move_mouse', {
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }

  async click(point?: Point, button?: MouseButton): Promise<void> {
    if (this.disposed) throw new Error('TauriOperator is disposed');
    const args: Record<string, unknown> = {};
    if (point) {
      args.point = { x: Math.round(point.x), y: Math.round(point.y) };
    }
    if (button) {
      args.button = button;
    }
    await invoke<void>('computer_click', args);
  }

  async typeText(text: string): Promise<void> {
    if (this.disposed) throw new Error('TauriOperator is disposed');
    if (typeof text !== 'string' || text.length === 0) return;
    await invoke<void>('computer_type_text', { text });
  }

  async pressKey(key: string): Promise<void> {
    if (this.disposed) throw new Error('TauriOperator is disposed');
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('pressKey requires a non-empty key name');
    }
    await invoke<void>('computer_press_key', { key });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

// Factory helpers

/**
 * Best-effort factory: returns a TauriOperator if the Tauri Rust backend is
 * reachable, otherwise returns null.  The ReAct loop / ComputerUseController
 * uses this to decide whether to use the native driver or fall back.
 */
export async function tryCreateTauriOperator(): Promise<TauriOperator | null> {
  const op = new TauriOperator();
  const health = await op.healthCheck();
  return health.ready ? op : null;
}

/**
 * Create a `ComputerUseAdapter` (the thin interface used by
 * `ComputerUseController`) backed by the Tauri Rust backend.
 *
 * Usage:
 *   const adapter = await createTauriAdapter();
 *   const controller = new ComputerUseController(adapter);
 */
export async function createTauriAdapter(): Promise<ComputerUseAdapter> {
  const op = new TauriOperator();
  return {
    getScreenSize: () => op.getScreenSize(),
    moveMouse: (point: Point) => op.moveMouse(point),
    click: (point?: Point, button?: MouseButton) => op.click(point, button),
    typeText: (text: string) => op.typeText(text),
    pressKey: (key: string) => op.pressKey(key),
    screenshot: () => op.screenshot(),
  };
}
