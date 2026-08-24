#!/usr/bin/env node

// Compares all language files and reports missing/extra keys per language.
// Exits with code 1 if discrepancies found (for CI integration).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Desktop language files
const DESKTOP_LANGS = {
  en: 'apps/desktop/src/i18n/en.ts',
  vi: 'apps/desktop/src/i18n/vi.ts',
  zh: 'apps/desktop/src/i18n/zh.ts',
  ru: 'apps/desktop/src/i18n/ru.ts',
  ja: 'apps/desktop/src/i18n/ja.ts',
  ko: 'apps/desktop/src/i18n/ko.ts',
};

// Mobile language files
const MOBILE_LANGS = {
  en: 'apps/mobile/src/i18n/en.ts',
  vi: 'apps/mobile/src/i18n/vi.ts',
  zh: 'apps/mobile/src/i18n/zh.ts',
  ru: 'apps/mobile/src/i18n/ru.ts',
  ja: 'apps/mobile/src/i18n/ja.ts',
  ko: 'apps/mobile/src/i18n/ko.ts',
};

/**
 * Extract all nested key paths from a TypeScript i18n file.
 * Parses lines like `keyName: 'value'` or `section: {` to build
 * dot-separated paths (e.g., "common.save", "marketplace.plugins").
 */
function extractKeys(filePath) {
  const content = fs.readFileSync(path.resolve(ROOT, filePath), 'utf-8');
  const lines = content.split('\n');
  const keys = new Set();
  const stack = []; // section stack

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('//') || trimmed === '') continue;

    // Opening brace - push section
    const sectionOpen = trimmed.match(/^(\w+)\s*:\s*\{/);
    if (sectionOpen) {
      stack.push(sectionOpen[1]);
      continue;
    }

    // Closing brace - pop section
    if (trimmed === '},' || trimmed === '}') {
      if (stack.length > 0) stack.pop();
      continue;
    }

    // Leaf key: any key not followed by an opening brace
    const leafMatch = trimmed.match(/^(\w+)\s*:\s*(?!\{)/);
    if (leafMatch) {
      const fullPath = [...stack, leafMatch[1]].join('.');
      keys.add(fullPath);
    }
  }

  return keys;
}

/**
 * Compare two key sets and return missing + extra keys.
 */
function compareKeys(reference, target, refName, targetName) {
  const missing = [...reference].filter((k) => !target.has(k)).sort();
  const extra = [...target].filter((k) => !reference.has(k)).sort();
  return { missing, extra, refName, targetName };
}

/**
 * Print comparison results for a group of language files.
 */
function checkGroup(label, langFiles) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label} i18n Validation`);
  console.log(`${'='.repeat(60)}`);

  // Check all files exist
  const keySets = {};
  let allExist = true;

  for (const [lang, file] of Object.entries(langFiles)) {
    const absPath = path.resolve(ROOT, file);
    if (!fs.existsSync(absPath)) {
      console.log(`  [ERROR] ${lang}: ${file} does not exist`);
      allExist = false;
      continue;
    }
    keySets[lang] = extractKeys(file);
    console.log(`  ${lang}: ${keySets[lang].size} keys`);
  }

  if (!allExist) return false;

  // Use 'en' as reference
  const refKeys = keySets['en'];
  if (!refKeys) {
    console.log('  [ERROR] English (en) reference file missing');
    return false;
  }

  let hasErrors = false;

  for (const [lang, keys] of Object.entries(keySets)) {
    if (lang === 'en') continue;
    const result = compareKeys(refKeys, keys, 'en', lang);

    if (result.missing.length === 0 && result.extra.length === 0) {
      console.log(`  [OK] ${lang}: matches en`);
    } else {
      hasErrors = true;
      if (result.missing.length > 0) {
        console.log(`  [MISSING in ${lang}] ${result.missing.length} keys:`);
        for (const key of result.missing) {
          console.log(`    - ${key}`);
        }
      }
      if (result.extra.length > 0) {
        console.log(`  [EXTRA in ${lang}] ${result.extra.length} keys:`);
        for (const key of result.extra) {
          console.log(`    + ${key}`);
        }
      }
    }
  }

  return !hasErrors;
}

// ---- Main ----
const desktopOk = checkGroup('Desktop', DESKTOP_LANGS);
const mobileOk = checkGroup('Mobile', MOBILE_LANGS);

console.log(`\n${'='.repeat(60)}`);
if (desktopOk && mobileOk) {
  console.log('  i18n validation PASSED - all language files match');
  console.log(`${'='.repeat(60)}\n`);
  process.exit(0);
} else {
  console.log('  i18n validation FAILED - discrepancies found');
  console.log(`${'='.repeat(60)}\n`);
  process.exit(1);
}
