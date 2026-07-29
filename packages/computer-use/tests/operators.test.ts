// ==============================================================================
// GHITA CODING AGENT - Operators / Screenshot Pipeline unit tests (Phase 1 Rust Rewrite)
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildScreenshotBundle,
  mockScreenshot,
  resizeIfNeeded,
  undoDpiScale,
  runReActLoop,
  type Operator,
  type ReActStep,
} from '../src/operators/index.js';
import type { ScreenCapture, ScreenSize } from '../src/index.js';

const fakePng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xfe, 0xa7, 0xcf, 0x6e, 0x48, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

class MockOperator implements Operator {
  readonly kind = 'mock' as const;
  getScreenSizeCalls = 0;
  screenshotCalls = 0;
  actions: string[] = [];
  capture: ScreenCapture = {
    mimeType: 'image/png',
    data: fakePng.toString('base64'),
    size: { width: 1280, height: 720 },
  };
  failOn = new Set<string>();

  getCapabilities() {
    return {
      canScreenshot: true,
      canMouse: true,
      canKeyboard: true,
      supportsDpiScaling: true,
    };
  }

  async healthCheck() {
    return { ready: true, kind: 'mock' as const, checkedAt: Date.now() };
  }

  async getScreenSize(): Promise<ScreenSize> {
    this.getScreenSizeCalls++;
    return this.capture.size ?? { width: 0, height: 0 };
  }

  async screenshot(): Promise<ScreenCapture> {
    this.screenshotCalls++;
    if (this.failOn.has('screenshot')) throw new Error('mock screenshot failure');
    return this.capture;
  }

  async moveMouse(p: { x: number; y: number }) {
    this.actions.push(`moveMouse:${p.x},${p.y}`);
    if (this.failOn.has('moveMouse')) throw new Error('moveMouse failed');
  }

  async click(p?: { x: number; y: number }, b?: 'left' | 'right' | 'middle') {
    this.actions.push(`click:${p?.x ?? '-'},${p?.y ?? '-'}:${b ?? 'left'}`);
    if (this.failOn.has('click')) throw new Error('click failed');
  }

  async typeText(text: string) {
    this.actions.push(`type:${text}`);
    if (this.failOn.has('typeText')) throw new Error('typeText failed');
  }

  async pressKey(key: string) {
    this.actions.push(`press:${key}`);
    if (this.failOn.has('pressKey')) throw new Error('pressKey failed');
  }

  async dispose() {
    /* no-op */
  }
}

describe('mockScreenshot', () => {
  it('returns a non-empty PNG payload', async () => {
    const cap = await mockScreenshot();
    expect(cap.mimeType).toBe('image/png');
    expect(cap.data.length).toBeGreaterThan(0);
    const decoded = Buffer.from(cap.data, 'base64');
    expect(decoded.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('respects custom size hint', async () => {
    const cap = await mockScreenshot({ width: 1920, height: 1080 });
    expect(cap.size).toEqual({ width: 1920, height: 1080 });
  });
});

describe('resizeIfNeeded', () => {
  it('skips resize when under the cap', () => {
    const out = resizeIfNeeded({ width: 1280, height: 720 }, 1920);
    expect(out.needsResize).toBe(false);
    expect(out.target).toEqual({ width: 1280, height: 720 });
  });

  it('resizes the longest edge to the cap', () => {
    const out = resizeIfNeeded({ width: 3840, height: 2160 }, 1920);
    expect(out.needsResize).toBe(true);
    expect(out.target).toEqual({ width: 1920, height: 1080 });
  });

  it('returns no target when size is missing', () => {
    const out = resizeIfNeeded(undefined, 1920);
    expect(out.needsResize).toBe(false);
    expect(out.target).toBeUndefined();
  });
});

describe('undoDpiScale', () => {
  it('halves dimensions at 2x DPI', () => {
    expect(undoDpiScale({ width: 2880, height: 1800 }, 2)).toEqual({ width: 1440, height: 900 });
  });

  it('passes through when scale is 1', () => {
    expect(undoDpiScale({ width: 1920, height: 1080 }, 1)).toEqual({ width: 1920, height: 1080 });
  });

  it('guards against zero / negative / NaN', () => {
    const size = { width: 1920, height: 1080 };
    expect(undoDpiScale(size, 0)).toEqual(size);
    expect(undoDpiScale(size, -1)).toEqual(size);
    expect(undoDpiScale(size, Number.NaN)).toEqual(size);
  });
});

describe('buildScreenshotBundle', () => {
  it('returns capture, size, and resize decision', async () => {
    const op = new MockOperator();
    const bundle = await buildScreenshotBundle(op, { maxEdge: 1920 });
    expect(bundle.capture.mimeType).toBe('image/png');
    expect(bundle.size).toEqual({ width: 1280, height: 720 });
    expect(bundle.resize.needsResize).toBe(false);
  });

  it('flags large captures for resize', async () => {
    const op = new MockOperator();
    op.capture = {
      mimeType: 'image/png',
      data: fakePng.toString('base64'),
      size: { width: 3840, height: 2160 },
    };
    const bundle = await buildScreenshotBundle(op, { maxEdge: 1920 });
    expect(bundle.resize.needsResize).toBe(true);
    expect(bundle.resize.target).toEqual({ width: 1920, height: 1080 });
  });
});

describe('runReActLoop', () => {
  it('stops on the first finished action', async () => {
    const op = new MockOperator();
    const result = await runReActLoop({
      goal: 'open notepad',
      operator: op,
      model: async () => ({
        rawPrediction: 'Action: finished',
        thought: 'done',
      }),
      maxIterations: 5,
    });
    expect(result.stopReason).toBe('completed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.action.type).toBe('finished');
  });

  it('executes a click action and continues', async () => {
    const op = new MockOperator();
    const calls = vi.fn();
    const model = vi
      .fn()
      .mockImplementationOnce(async () => ({
        rawPrediction: 'Action: click(start_box="[100,100,200,200]")',
        thought: 'click the button',
      }))
      .mockImplementationOnce(async () => ({
        rawPrediction: 'Action: finished',
        thought: 'done',
      }));
    const result = await runReActLoop({
      goal: 'press submit',
      operator: op,
      model: model as unknown as Parameters<typeof runReActLoop>[0]['model'],
      onStep: (s) => calls(s),
    });
    expect(model).toHaveBeenCalledTimes(2);
    expect(op.actions[0]).toMatch(/^click:/);
    expect(result.stopReason).toBe('completed');
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('stops with max-iterations when the model never returns a terminal action', async () => {
    const op = new MockOperator();
    let i = 0;
    const result = await runReActLoop({
      goal: 'never ends',
      operator: op,
      model: async () => {
        i += 1;
        return {
          rawPrediction: `Action: click(start_box="[10,10,20,20]") (iter ${i})`,
          thought: 'go',
        };
      },
      maxIterations: 3,
    });
    expect(result.stopReason).toBe('max-iterations');
    expect(result.steps.length).toBeLessThanOrEqual(3);
  });

  it('reports unsupported when the parser returns nothing', async () => {
    const op = new MockOperator();
    const result = await runReActLoop({
      goal: 'unparseable',
      operator: op,
      model: async () => ({ rawPrediction: '<<<not an action>>>', thought: 'huh' }),
      maxIterations: 2,
    });
    expect(result.stopReason).toBe('unsupported');
    expect(result.steps[0]?.success).toBe(false);
  });

  it('reports error when the operator throws on click', async () => {
    const op = new MockOperator();
    op.failOn.add('click');
    const result = await runReActLoop({
      goal: 'click fails',
      operator: op,
      model: async () => ({
        rawPrediction: 'Action: click(start_box="[0,0,10,10]")',
        thought: 'click',
      }),
      maxIterations: 1,
    });
    expect(result.stopReason).toBe('unsupported');
    expect(result.steps[0]?.success).toBe(false);
    expect(result.steps[0]?.error).toMatch(/click failed/);
  });

  it('reports an error when screenshot capture fails (no silent mock fallback)', async () => {
    // v0.4.9 A7: the production loop no longer swaps in a mock screenshot when
    // capture fails — a failed capture is surfaced as a real error step.
    const op = new MockOperator();
    op.failOn.add('screenshot');
    const result = await runReActLoop({
      goal: 'still works',
      operator: op,
      model: async () => ({ rawPrediction: 'Action: finished', thought: 'ok' }),
    });
    expect(result.stopReason).toBe('error');
    expect(result.steps[0]?.success).toBe(false);
    expect(result.steps[0]?.thought).toMatch(/screenshot capture failed/);
  });

  it('honours the abort signal', async () => {
    const op = new MockOperator();
    const controller = new AbortController();
    controller.abort();
    const result = await runReActLoop({
      goal: 'abort',
      operator: op,
      model: async () => ({ rawPrediction: 'Action: finished', thought: 'ok' }),
      signal: controller.signal,
    });
    expect(['error', 'completed']).toContain(result.stopReason);
  });
});

describe('operator types sanity', () => {
  it('ReActStep shape is stable', () => {
    const step: ReActStep = {
      iteration: 1,
      thought: 'thought',
      action: { type: 'click', inputs: {} },
      success: true,
      durationMs: 10,
    };
    expect(step.iteration).toBe(1);
  });
});
