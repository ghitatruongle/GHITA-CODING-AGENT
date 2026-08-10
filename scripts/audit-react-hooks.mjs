#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - React hooks audit (v1.1.0 Track 10 R2)
// ------------------------------------------------------------------------------
// Quét apps/desktop/src cho:
//   [H1] useEffect không có deps array (chạy mỗi render)
//   [H2] useEffect có deps nhưng không cleanup function (return) — tiềm ẩn leak
//   [H3] addEventListener/.on(/subscribe( — có return cleanup ngay trong effect?
//   [H4] setInterval/setTimeout trong useEffect không clear trong cleanup
// Báo cáo: số lượng theo rule + danh sách file nghi vấn (mẫu).
// Usage: node scripts/audit-react-hooks.mjs
// ==============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'apps/desktop/src';

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'test', 'tests', '__tests__'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) files.push(full);
  }
  return files;
}

function main() {
  const files = walk(join(root, TARGET));
  const counts = { H1: 0, H2: 0, H3: 0, H4: 0, hooksTotal: 0 };
  const samples = { H1: [], H2: [], H3: [], H4: [] };

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const lines = source.split('\n');
    counts.hooksTotal += (source.match(/useEffect|useCallback|useMemo|useRef|useState/g) ?? []).length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const hookMatch = line.match(/useEffect\s*\(/);
      if (!hookMatch) continue;

      // H1: useEffect( without deps on the same line
      if (!line.includes('],') && !line.includes('})') && !line.includes('[]') && !line.includes(', [')) {
        // check next line for deps
        const next = lines[i + 1] ?? '';
        const hasDeps = /,\s*\[|\[\]/.test(line) || /^[ \t]*,[ \t]*\[/.test(next);
        if (!hasDeps) {
          counts.H1++;
          if (samples.H1.length < 8) samples.H1.push(`${file.replace(root + '/', '')}:${i + 1} ${line.trim().slice(0, 70)}`);
        }
      }

      // H2/H4: effect block — look ahead for body + missing return cleanup
      let body = '';
      for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
        body += lines[j] ?? '';
        if ((lines[j] ?? '').includes('},')) break;
      }
      const hasCleanup = /return\s*\(?\s*(()|clear|remove|off|dispose|unsubscribe|destroy)/.test(body);
      const hasTimer = /setInterval|setTimeout/.test(body);
      if (!hasCleanup && (hasTimer || /addEventListener|\.on\(|subscribe\(|\.off\(/.test(body))) {
        if (hasTimer) {
          counts.H4++;
          if (samples.H4.length < 8) samples.H4.push(`${file.replace(root + '/', '')}:${i + 1}`);
        } else {
          counts.H3++;
          if (samples.H3.length < 8) samples.H3.push(`${file.replace(root + '/', '')}:${i + 1}`);
        }
      }
      if (!hasCleanup) {
        counts.H2++;
        if (samples.H2.length < 8) samples.H2.push(`${file.replace(root + '/', '')}:${i + 1}`);
      }
    }
  }

  process.stdout.write('# React hooks audit (R2) — apps/desktop/src\n\n');
  process.stdout.write(`| Rule | Count | Ý nghĩa |\n|---|---|---|\n`);
  process.stdout.write(`| H1 useEffect không deps rõ | ${counts.H1} | chạy mỗi render — cần xem xét |\n`);
  process.stdout.write(`| H2 effect không cleanup | ${counts.H2} | tiềm ẩn leak nếu có sub/timer |\n`);
  process.stdout.write(`| H3 sub/addEventListener không cleanup | ${counts.H3} | leak listener |\n`);
  process.stdout.write(`| H4 timer trong effect không clear | ${counts.H4} | leak timer |\n`);
  process.stdout.write(`| Tổng hook (useEffect/useCallback/useMemo/useRef/useState) | ${counts.hooksTotal} | — |\n`);
  process.stdout.write(`\nFiles quét: ${files.length}\n\nMẫu H1:\n`);
  for (const s of samples.H1) process.stdout.write(`  ${s}\n`);
  process.stdout.write('Mẫu H3 (sub không cleanup):\n');
  for (const s of samples.H3) process.stdout.write(`  ${s}\n`);
  process.stdout.write('Mẫu H4 (timer không clear):\n');
  for (const s of samples.H4) process.stdout.write(`  ${s}\n`);
}

main();
