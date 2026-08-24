// Ensures every locale exports the exact same key tree as the reference (vi).
// A missing translation would silently fall through to the key string in prod.

import { describe, it, expect } from '@jest/globals';
import { vi } from '../i18n/vi';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { ru } from '../i18n/ru';
import { ja } from '../i18n/ja';
import { ko } from '../i18n/ko';

type Dict = Record<string, unknown>;

function collectKeys(obj: unknown, prefix = ''): string[] {
  const out: string[] = [];
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...collectKeys(v, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

const referenceKeys = collectKeys(vi);

describe('i18n locale parity', () => {
  const locales: Array<{ name: string; dict: unknown }> = [
    { name: 'en', dict: en },
    { name: 'zh', dict: zh },
    { name: 'ru', dict: ru },
    { name: 'ja', dict: ja },
    { name: 'ko', dict: ko },
  ];

  it.each(locales)('$name has the same key set as vi', ({ dict }) => {
    const keys = collectKeys(dict);
    expect(keys).toEqual(referenceKeys);
  });

  it.each(locales)('$name has no empty string values', ({ dict }) => {
    function walk(o: unknown, prefix = ''): void {
      if (o == null || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o as Dict)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string') {
              expect({ path, item }).not.toEqual({ path, item: '' });
            }
          }
        } else if (typeof v === 'string') {
          expect(v.length).toBeGreaterThan(0);
        } else if (v != null && typeof v === 'object') {
          walk(v, path);
        }
      }
    }
    walk(dict);
  });
});