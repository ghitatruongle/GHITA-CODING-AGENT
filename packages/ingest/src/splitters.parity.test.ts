// JS↔Rust parity for ingest splitters (BUG-001/BUG-004 regression, v1.2.0-demo1).
// Loads splitters twice — once with the native bridge forced off (JS reference),
// once with it on (Rust addon when built) — and asserts identical chunking.
// On machines without the built addon both paths are JS → trivially equal (CI-safe).

import { describe, it, expect, vi } from 'vitest';
import type { ChunkingOptions } from './types.js';
import type * as SplittersNS from './splitters.js';
import type * as NativeBridgeNS from '@ghita/native-bridge';

type SplittersModule = typeof SplittersNS;

async function loadSplitters(nativeEnabled: boolean): Promise<SplittersModule> {
  vi.resetModules();
  vi.doMock('@ghita/native-bridge', async (importOriginal) => {
    const orig = await importOriginal<NativeBridgeNS>();
    if (nativeEnabled) return orig;
    return {
      ...orig,
      loadNative: () => ({ native: false, impl: undefined, fallbackReason: 'parity-test: native disabled' }),
    };
  });
  return import('./splitters.js');
}

const FIXTURES: Array<{ name: string; text: string; options?: ChunkingOptions }> = [
  { name: 'ascii markdown', text: '# Title\n\npara one\n\n## Sub\n\npara two' },
  { name: 'h4 not heading', text: '#### nope\nbody text here' },
  { name: 'heading only', text: '## Solo\n\n## Next\nbody' },
  { name: 'cjk fixed', text: '中文测试：中文文本的中文分词与拆分处理。'.repeat(20), options: { chunkSize: 40, overlap: 4 } },
  { name: 'vietnamese fixed', text: 'Xin chào thế giới tiếng Việt có dấu. '.repeat(30), options: { chunkSize: 37, overlap: 9 } },
  { name: 'emoji markdown', text: '# 🚀 中文标题\n\nbody\n\n## English Sub\n\n🚀🔥💡 tail' },
  { name: 'oversized section', text: `## Big\n${'y'.repeat(2500)}`, options: { chunkSize: 500, overlap: 100 } },
  { name: 'single char', text: 'x' },
  { name: 'empty', text: '' },
  { name: 'whitespace only', text: '   \n\n  ' },
];

describe('splitters JS↔Rust parity (BUG-001/BUG-004)', () => {
  for (const fx of FIXTURES) {
    it(`splitFixed parity — ${fx.name}`, async () => {
      const js = await loadSplitters(false);
      const native = await loadSplitters(true);
      expect(native.splitFixed(fx.text, fx.options)).toEqual(js.splitFixed(fx.text, fx.options));
    });

    it(`splitMarkdown parity — ${fx.name}`, async () => {
      const js = await loadSplitters(false);
      const native = await loadSplitters(true);
      expect(native.splitMarkdown(fx.text, fx.options)).toEqual(js.splitMarkdown(fx.text, fx.options));
    });
  }
});
