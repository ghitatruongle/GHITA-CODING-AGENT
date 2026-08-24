import { describe, it, expect } from 'vitest';
import {
  splitFixed,
  splitMarkdown,
  splitCode,
  splitRecursive,
  chunkDocument,
} from './splitters.js';
import { loadDocument } from './loaders.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CJK = '中文测试：中文文本的中文分词与拆分处理。';
const EMOJI = '🚀🔥💡 test with emoji mixed 中文字符 émojis 🎉';
const MIXED = 'English words + 日本語のテキスト + 한국어 텍스트 + emoji 🚀\nSecond line 中文';

describe('splitters — unicode/CJK/emoji (R6)', () => {
  it('splitFixed preserves CJK chars without breaking UTF-8', () => {
    const parts = splitFixed(CJK.repeat(50), { chunkSize: 40, overlap: 4 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => Array.from(p).length <= 40)).toBe(true); // char count (not bytes)
    expect(parts.join('').replace(/\s/g, '')).toContain(CJK.slice(0, 6));
  });

  it('splitMarkdown keeps emoji + CJK headings intact', () => {
    const md = `# 🚀 中文标题\n\n${CJK}\n\n## English Sub\n\n${EMOJI}`;
    const parts = splitMarkdown(md);
    expect(parts.some((p) => p.includes('🚀 中文标题'))).toBe(true);
    expect(parts.some((p) => p.includes(EMOJI))).toBe(true);
  });

  it('splitCode windows multi-byte lines', () => {
    const lines = Array.from(
      { length: 40 },
      (_, i) => `${i}: 中文行 ${'🚀'.repeat(3)} ${MIXED}`,
    ).join('\n');
    const parts = splitCode(lines, { chunkSize: 10 });
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[0]).toContain('中文');
  });

  it('splitRecursive handles emoji-only paragraphs', () => {
    const parts = splitRecursive(`${'🚀'.repeat(200)}\n\n${CJK}`);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toContain('🚀');
  });

  it('chunkDocument with CJK content is stable', () => {
    const chunks = chunkDocument({
      path: 'vi.md',
      source: 'markdown',
      content: `# 标题\n\n${MIXED}`,
      hash: 'h',
      bytes: 10,
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('splitters — empty / 0 / 1 / large (R6)', () => {
  it('empty string → no parts (all splitters)', () => {
    expect(splitFixed('')).toHaveLength(0);
    expect(splitMarkdown('')).toHaveLength(0);
    expect(splitCode('')).toHaveLength(0);
    expect(splitRecursive('')).toHaveLength(0);
    expect(splitFixed('   \n\n  ')).toHaveLength(0);
  });

  it('single char input', () => {
    expect(splitFixed('x')).toEqual(['x']);
    expect(splitMarkdown('x')).toEqual(['x']);
    expect(splitRecursive('x')).toEqual(['x']);
  });

  it('single line exactly at chunk size', () => {
    const text = 'a'.repeat(1200);
    expect(splitFixed(text, { chunkSize: 1200, overlap: 0 })).toHaveLength(1);
  });

  it('large input (100k chars) completes with bounded chunks', () => {
    const big = `${CJK}\n`.repeat(8000); // ~160k chars
    const parts = splitFixed(big, { chunkSize: 1000, overlap: 50 });
    expect(parts.length).toBeGreaterThan(100);
    expect(parts.every((p) => Array.from(p).length <= 1000)).toBe(true);
  });

  it('N=0/1 files in directory load', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edge-dir-'));
    const empty = await loadDocument(join(dir, 'empty.md'));
    expect(empty.skipped).toBeDefined(); // file missing → skipped
    writeFileSync(join(dir, 'one.md'), '# One\ncontent');
    const one = await loadDocument(join(dir, 'one.md'));
    expect(one.document?.content).toContain('One');
    rmSync(dir, { recursive: true, force: true });
  });

  it('very long single line is handled (minified skip in fast scan path)', () => {
    // Scanner fast path skips lines > 2000 — splitters still chunk them.
    const long = 'x'.repeat(10_000);
    
    const parts = splitFixed(long, { chunkSize: 500 });
    expect(parts.length).toBe(25);
    expect(parts.every((p) => p.length <= 500)).toBe(true);
  });
});
