// ==============================================================================
// GHITA CODING AGENT - Computer Use Package
// ==============================================================================

import type { SkillDefinition } from '@ghita/skills';
import type { SkillResult } from '@ghita/shared';

export const COMPUTER_USE_VERSION = '0.1.0';

export interface Point {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface ScreenCapture {
  mimeType: string;
  data: string;
  size?: ScreenSize;
}

export type MouseButton = 'left' | 'right' | 'middle';

export type ComputerUseAction =
  | { type: 'moveMouse'; point: Point }
  | { type: 'click'; point?: Point; button?: MouseButton }
  | { type: 'typeText'; text: string }
  | { type: 'pressKey'; key: string }
  | { type: 'screenshot' };

export interface ComputerUseActionResult {
  action: ComputerUseAction;
  success: boolean;
  output?: string;
  error?: string;
  data?: unknown;
}

export interface ComputerUseAdapter {
  getScreenSize?: () => Promise<ScreenSize>;
  moveMouse?: (point: Point) => Promise<void>;
  click?: (point?: Point, button?: MouseButton) => Promise<void>;
  typeText?: (text: string) => Promise<void>;
  pressKey?: (key: string) => Promise<void>;
  screenshot?: () => Promise<ScreenCapture>;
}

export interface ComputerUseStatus {
  available: boolean;
  missing: string[];
}

function success(action: ComputerUseAction, output: string, data?: unknown): ComputerUseActionResult {
  return { action, success: true, output, data };
}

function failure(action: ComputerUseAction, error: string): ComputerUseActionResult {
  return { action, success: false, error };
}

function toSkillResult(result: ComputerUseActionResult): SkillResult {
  return {
    success: result.success,
    output: result.output,
    error: result.error,
    data: result.data,
  };
}

function readNumber(input: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export class ComputerUseController {
  constructor(private readonly adapter: ComputerUseAdapter = {}) {}

  getStatus(): ComputerUseStatus {
    const required: Array<keyof ComputerUseAdapter> = [
      'moveMouse',
      'click',
      'typeText',
      'pressKey',
      'screenshot',
    ];
    const missing = required.filter((key) => typeof this.adapter[key] !== 'function');
    return { available: missing.length === 0, missing };
  }

  async moveMouse(point: Point): Promise<ComputerUseActionResult> {
    const action: ComputerUseAction = { type: 'moveMouse', point };
    if (!this.adapter.moveMouse) return failure(action, 'Mouse movement adapter is not available.');
    await this.adapter.moveMouse(point);
    return success(action, `Moved mouse to ${point.x}, ${point.y}.`);
  }

  async click(point?: Point, button: MouseButton = 'left'): Promise<ComputerUseActionResult> {
    const action: ComputerUseAction = { type: 'click', point, button };
    if (!this.adapter.click) return failure(action, 'Mouse click adapter is not available.');
    await this.adapter.click(point, button);
    return success(action, `Clicked ${button}${point ? ` at ${point.x}, ${point.y}` : ''}.`);
  }

  async typeText(text: string): Promise<ComputerUseActionResult> {
    const action: ComputerUseAction = { type: 'typeText', text };
    if (!this.adapter.typeText) return failure(action, 'Keyboard typing adapter is not available.');
    await this.adapter.typeText(text);
    return success(action, `Typed ${text.length} characters.`);
  }

  async pressKey(key: string): Promise<ComputerUseActionResult> {
    const action: ComputerUseAction = { type: 'pressKey', key };
    if (!this.adapter.pressKey) return failure(action, 'Keyboard key adapter is not available.');
    await this.adapter.pressKey(key);
    return success(action, `Pressed ${key}.`);
  }

  async screenshot(): Promise<ComputerUseActionResult> {
    const action: ComputerUseAction = { type: 'screenshot' };
    if (!this.adapter.screenshot) return failure(action, 'Screenshot adapter is not available.');
    const capture = await this.adapter.screenshot();
    return success(action, 'Captured screenshot.', capture);
  }

  async runAction(action: ComputerUseAction): Promise<ComputerUseActionResult> {
    switch (action.type) {
      case 'moveMouse':
        return this.moveMouse(action.point);
      case 'click':
        return this.click(action.point, action.button);
      case 'typeText':
        return this.typeText(action.text);
      case 'pressKey':
        return this.pressKey(action.key);
      case 'screenshot':
        return this.screenshot();
    }
  }

  async runSequence(actions: ComputerUseAction[]): Promise<ComputerUseActionResult[]> {
    const results: ComputerUseActionResult[] = [];
    for (const action of actions) {
      const result = await this.runAction(action);
      results.push(result);
      if (!result.success) break;
    }
    return results;
  }
}

// NOTE: sandbox.js re-exports removed to avoid bundling Node.js APIs (child_process, fs, etc.)
// in browser/frontend builds. Import from '@ghita/computer-use/sandbox' directly in Node.js contexts.

export function createComputerUseSkills(controller = new ComputerUseController()): SkillDefinition[] {
  return [
    {
      id: 'computer.moveMouse',
      name: 'Move Mouse',
      description: 'Move the mouse cursor to screen coordinates.',
      category: 'computer',
      enabled: false,
      version: COMPUTER_USE_VERSION,
      scopes: ['desktop'],
      status: 'disabled',
      parameters: {
        x: { type: 'number', description: 'X coordinate', required: true },
        y: { type: 'number', description: 'Y coordinate', required: true },
      },
      run: async ({ input }) => {
        const x = readNumber(input, 'x');
        const y = readNumber(input, 'y');
        if (x === undefined || y === undefined) {
          return { success: false, error: 'Missing required inputs: x and y' };
        }
        return toSkillResult(await controller.moveMouse({ x, y }));
      },
    },
    {
      id: 'computer.click',
      name: 'Click Mouse',
      description: 'Click at the current cursor or a target coordinate.',
      category: 'computer',
      enabled: false,
      version: COMPUTER_USE_VERSION,
      scopes: ['desktop'],
      status: 'disabled',
      parameters: {
        x: { type: 'number', description: 'Optional X coordinate', required: false },
        y: { type: 'number', description: 'Optional Y coordinate', required: false },
      },
      run: async ({ input }) => {
        const x = readNumber(input, 'x');
        const y = readNumber(input, 'y');
        const point = x === undefined || y === undefined ? undefined : { x, y };
        return toSkillResult(await controller.click(point));
      },
    },
    {
      id: 'computer.typeText',
      name: 'Type Text',
      description: 'Type text through the keyboard adapter.',
      category: 'computer',
      enabled: false,
      version: COMPUTER_USE_VERSION,
      scopes: ['desktop'],
      status: 'disabled',
      parameters: {
        text: { type: 'string', description: 'Text to type', required: true },
      },
      run: async ({ input }) => {
        const text = readString(input, 'text');
        if (!text) return { success: false, error: 'Missing required input: text' };
        return toSkillResult(await controller.typeText(text));
      },
    },
    {
      id: 'computer.screenshot',
      name: 'Computer Screenshot',
      description: 'Capture the screen through the computer-use adapter.',
      category: 'computer',
      enabled: false,
      version: COMPUTER_USE_VERSION,
      scopes: ['desktop'],
      status: 'disabled',
      run: async () => toSkillResult(await controller.screenshot()),
    },
  ];
}
