// v1.2.0-demo1 review: the bench-cpu [E] probe must mirror production
// lineDiffStat exactly (it is the CI baseline measurement).
import { lineDiffStatJS } from '../scripts/bench-cpu.mjs';
import { lineDiffStat } from '../apps/desktop/src/utils/editProposal.js';

const cases: Array<[string, string]> = [
  ['', 'a'],
  ['a', ''],
  ['', ''],
  ['a', 'a'],
  ['x\nx\nx', 'x\nx'],
  ['a\nb\nc', 'c\nb\na'],
  ['line1\nline2', 'line1\nEDITED'],
  ['中文\n测试', '中文\n修改'],
  ['🚀\n🔥', '🔥\n🚀'],
  ['only', 'other'],
];
let bad = 0;
for (const [a, b] of cases) {
  const p = lineDiffStat(a, b);
  const q = lineDiffStatJS(a, b);
  if (p.added !== q.added || p.removed !== q.removed) {
    bad++;
    console.log('MISMATCH', JSON.stringify([a, b]), p, q);
  }
}
let s = 1;
const rnd = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 0x100000000;
};
for (let f = 0; f < 300; f++) {
  const mk = (n: number) =>
    Array.from({ length: n }, () => ['a', 'b', '中', '🚀', ''][Math.floor(rnd() * 5)]).join('\n');
  const a = mk(Math.floor(rnd() * 30));
  const b = mk(Math.floor(rnd() * 30));
  const p = lineDiffStat(a, b);
  const q = lineDiffStatJS(a, b);
  if (p.added !== q.added || p.removed !== q.removed) {
    bad++;
    console.log('FUZZ MISMATCH', f, JSON.stringify([a, b]), p, q);
  }
}
console.log(bad === 0 ? 'PROBE==PRODUCTION on 310 cases OK' : `${bad} mismatches`);
process.exit(bad === 0 ? 0 : 1);
