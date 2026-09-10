// v1.2.0-demo1 review pass: adversarial fuzz for splitters — Rust native vs JS
// reference must agree on BMP inputs; BOTH must never split a surrogate pair
// (emoji) nor produce lone surrogates.

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
      loadNative: () => ({
        native: false,
        impl: undefined,
        fallbackReason: 'parity-test: native disabled',
      }),
    };
  });
  return import('./splitters.js');
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A string is surrogate-safe if it contains no lone surrogates. */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const BMP_SHAPES = [
  'Xin chào thế giới tiếng Việt có dấu: ă â ê ô ơ ư đ. '.repeat(30),
  '中文测试：中文文本的中文分词与拆分处理。'.repeat(25),
  `${'line\n'.repeat(50)  }## Heading\nbody text\n\n### Sub\nmore`,
  'a'.repeat(1),
  '   \n\n  ',
  '',
  `## H\n\n${  'x'.repeat(3000)}`,
  '#### not\n## yes\nbody',
  '##   \ncontent after empty heading',
];

const OPTIONS: ChunkingOptions[] = [
  {},
  { chunkSize: 40, overlap: 4 },
  { chunkSize: 37, overlap: 100 }, // overlap > chunkSize/2 → clamp path
  { chunkSize: 1, overlap: 0 },
  { chunkSize: 1200, overlap: 0 },
];

describe('splitters adversarial fuzz — native vs JS parity (BMP)', () => {
  for (const [oi, opts] of OPTIONS.entries()) {
    for (const [si, text] of BMP_SHAPES.entries()) {
      it(`splitFixed opts#${oi} shape#${si}`, async () => {
        const js = await loadSplitters(false);
        const native = await loadSplitters(true);
        expect(native.splitFixed(text, opts)).toEqual(js.splitFixed(text, opts));
      });
      it(`splitMarkdown opts#${oi} shape#${si}`, async () => {
        const js = await loadSplitters(false);
        const native = await loadSplitters(true);
        expect(native.splitMarkdown(text, opts)).toEqual(js.splitMarkdown(text, opts));
      });
    }
  }
});

describe('splitters — surrogate safety (emoji must never be split)', () => {
  const emojiText = '🚀🔥💡'.repeat(100); // 600 UTF-16 units of pure pairs
  it('splitFixed JS never emits lone surrogates', async () => {
    const js = await loadSplitters(false);
    for (const cs of [5, 7, 9, 1201]) {
      const parts = js.splitFixed(emojiText, { chunkSize: cs, overlap: 3 });
      for (const p of parts) {
        expect(hasLoneSurrogate(p), `chunkSize=${cs} chunk starts ${p.slice(0, 6)}`).toBe(false);
      }
    }
  });
  it('splitFixed native never emits lone surrogates', async () => {
    const native = await loadSplitters(true);
    const parts = native.splitFixed(emojiText, { chunkSize: 5, overlap: 3 });
    for (const p of parts) expect(hasLoneSurrogate(p)).toBe(false);
  });
});

describe('splitters — randomized BMP fuzz (50 rounds)', () => {
  const rnd = seeded(424242);
  const alphabet = ['ab', '中文', 'éá', '## H', '### S', '#### N', '', ' ', '\n', 'x'];
  it('splitFixed + splitMarkdown parity', async () => {
    const js = await loadSplitters(false);
    const native = await loadSplitters(true);
    for (let f = 0; f < 50; f++) {
      const mk = (len: number) =>
        Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(' ');
      const a = mk(1 + Math.floor(rnd() * 80));
      const opts: ChunkingOptions = {
        chunkSize: 1 + Math.floor(rnd() * 60),
        overlap: Math.floor(rnd() * 40),
      };
      expect(native.splitFixed(a, opts), `round ${f} fixed`).toEqual(js.splitFixed(a, opts));
      expect(native.splitMarkdown(a, opts), `round ${f} md`).toEqual(js.splitMarkdown(a, opts));
    }
  });
});
