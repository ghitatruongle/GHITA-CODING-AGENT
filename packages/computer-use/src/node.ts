// ==============================================================================
// GHITA CODING AGENT - nut.js Adapter
// ==============================================================================

import type { ComputerUseAdapter, MouseButton, Point, ScreenCapture } from './index.js';

export { DSOOrchestrator } from './sandbox/dsoOrchestrator.js';
export { SandboxSecurityFilter } from './guardrails/sandboxFilter.js';
export { SandboxLogger } from './sandbox/sandboxLogger.js';
export { SecurityLogger } from './guardrails/securityLogger.js';
export { SandboxValidationReporter, type SandboxValidationReport, type ValidationResult } from './sandboxValidationReporter.js';
export * from './guardrails/index.js';

type NutButtonMap = Record<string, unknown>;
type NutKeyMap = Record<string, unknown>;

interface NutScreenCapture {
  data?: Buffer | Uint8Array | string;
  width?: number;
  height?: number;
}

function resolveMouseButton(button: MouseButton | undefined, buttons: NutButtonMap): unknown {
  const normalized = button ?? 'left';
  return buttons[normalized] ?? buttons[normalized.toUpperCase()] ?? buttons.LEFT;
}

function resolveKey(key: string, keys: NutKeyMap): unknown {
  return keys[key] ?? keys[key.toUpperCase()] ?? key;
}

function encodeCapture(capture: unknown): ScreenCapture {
  const typed = capture as NutScreenCapture;
  const raw = typed.data;

  if (typeof raw === 'string') {
    return {
      mimeType: 'image/png',
      data: raw,
      size: typed.width && typed.height ? { width: typed.width, height: typed.height } : undefined,
    };
  }

  if (raw instanceof Uint8Array) {
    return {
      mimeType: 'image/png',
      data: Buffer.from(raw).toString('base64'),
      size: typed.width && typed.height ? { width: typed.width, height: typed.height } : undefined,
    };
  }

  return {
    mimeType: 'application/json',
    data: Buffer.from(JSON.stringify(capture)).toString('base64'),
  };
}

export async function createNutJsAdapter(): Promise<ComputerUseAdapter> {
  const nut = await import('@nut-tree/nut-js');

  return {
    getScreenSize: async () => ({
      width: await nut.screen.width(),
      height: await nut.screen.height(),
    }),
    moveMouse: async (point: Point) => {
      await nut.mouse.setPosition(new nut.Point(point.x, point.y));
    },
    click: async (point, button) => {
      if (point) {
        await nut.mouse.setPosition(new nut.Point(point.x, point.y));
      }
      await nut.mouse.click(resolveMouseButton(button, nut.Button));
    },
    typeText: (text) => nut.keyboard.type(text),
    pressKey: (key) => nut.keyboard.pressKey(resolveKey(key, nut.Key)),
    screenshot: async () => encodeCapture(await nut.screen.capture()),
  };
}
