// v1.2.0-demo1 P2.2 area-3 bench: splitFixed on non-ASCII. Before the BUG-001
// fix the native path panicked on CJK/Vietnamese and every doc fell back to
// JS; after the fix native handles it. Times both paths + checks parity.
import { performance } from 'node:perf_hooks';
import { loadNative } from '../packages/native-bridge/src/index.js';

const cjk = '中文测试：中文文本的中文分词与拆分处理。Xin chào thế giới tiếng Việt có dấu. '.repeat(4000);
console.log('input chars:', cjk.length);

// JS reference loop (verbatim from packages/ingest/src/splitters.ts fallback).
function splitFixedJS(text: string, chunkSize = 1200, overlapIn = 100): string[] {
  const overlap = Math.min(overlapIn, Math.floor(chunkSize / 2));
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    parts.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return parts.filter((p) => p.trim().length > 0);
}

const t0 = performance.now();
const jsParts = splitFixedJS(cjk);
const jsMs = performance.now() - t0;

const bridge = loadNative('retrieval', undefined as never);
if (!bridge.native) {
  console.log('native addon NOT loaded — JS only:', jsMs.toFixed(1), 'ms');
  process.exit(0);
}
const impl = bridge.impl as { splitFixedNative(t: string, c: number, o: number): { text: string }[] };
const t1 = performance.now();
const natParts = impl.splitFixedNative(cjk, 1200, 100);
const natMs = performance.now() - t1;

console.log(`splitFixed CJK ${cjk.length} chars — JS: ${jsMs.toFixed(1)}ms (${jsParts.length} parts) | native: ${natMs.toFixed(1)}ms (${natParts.length} parts) | speedup: ${(jsMs / natMs).toFixed(1)}x`);
const same = jsParts.length === natParts.length && jsParts.every((p, i) => p === natParts[i]!.text);
console.log('parity JS==native:', same);
