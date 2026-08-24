// Wave 3b — ScreenCapture config/lifecycle without real capture hardware

import { describe, it, expect, vi } from 'vitest';
import { ScreenCapture } from '../src/screen-capture.js';

describe('ScreenCapture', () => {
  it('updateConfig/getConfig/dispose lifecycle', () => {
    const sc = new ScreenCapture({ quality: 50, interval: 500 });
    expect(sc.getConfig().quality).toBe(50);
    sc.updateConfig({ maxWidth: 800 });
    expect(sc.getConfig().maxWidth).toBe(800);
    expect(sc.streaming).toBe(false);
    sc.dispose();
    expect(sc.streaming).toBe(false);
  });

  it('startStream/stopStream manage streaming flag even if capture fails', async () => {
    vi.useFakeTimers();
    const sc = new ScreenCapture({ interval: 1000 });
    // capture will fail without screenshot module — stream should still start
    const frames: string[] = [];
    sc.startStream((b64) => frames.push(b64));
    expect(sc.streaming).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    sc.stopStream();
    expect(sc.streaming).toBe(false);
    vi.useRealTimers();
  });
});
