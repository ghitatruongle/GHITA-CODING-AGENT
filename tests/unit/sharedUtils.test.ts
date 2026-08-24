import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  generateUUID,
  getPlatform,
  isDesktop,
  isMobile,
  isWindows,
  isLinux,
  generateId,
  generatePairingCode,
  truncate,
  capitalize,
  camelToKebab,
  kebabToCamel,
  clamp,
  randomInt,
  chunk,
  unique,
  groupBy,
  pick,
  omit,
  sleep,
  retry,
  isValidUrl,
  isValidApiKey,
  formatDate,
  getRelativeTime,
} from '../../packages/shared/src/utils.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// generateUUID

describe('generateUUID()', () => {
  it('should return a string', () => {
    const id = generateUUID();
    expect(typeof id).toBe('string');
  });

  it('should return a UUID v4 formatted string', () => {
    const id = generateUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should return unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });

  it('should use the fallback when crypto.randomUUID is not available', () => {
    vi.stubGlobal('crypto', {});
    const id = generateUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should use the fallback when crypto.randomUUID throws', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('Not available');
      },
    });
    const id = generateUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should use the crypto.randomUUID when available', () => {
    const fixedUUID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    vi.stubGlobal('crypto', {
      randomUUID: () => fixedUUID,
    });
    expect(generateUUID()).toBe(fixedUUID);
  });
});

// getPlatform

describe('getPlatform()', () => {
  it('should detect React Native via navigator.product', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', userAgent: '' });
    expect(getPlatform()).toBe('android');
  });

  it('should detect Android via userAgent', () => {
    vi.stubGlobal('navigator', {
      product: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    });
    expect(getPlatform()).toBe('android');
  });

  it('should detect Windows via process.platform', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'win32' });
    expect(getPlatform()).toBe('windows');
  });

  it('should detect Linux via process.platform', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'linux' });
    expect(getPlatform()).toBe('linux');
  });

  it('should detect macOS via process.platform', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'darwin' });
    expect(getPlatform()).toBe('macos');
  });

  it('should return linux as default fallback when nothing is detected', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', undefined);
    expect(getPlatform()).toBe('linux');
  });

  it('should detect Tauri environment on Windows', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('window', {
      __TAURI__: { os: { platform: 'win32' } },
    });
    expect(getPlatform()).toBe('windows');
  });

  it('should detect Tauri environment on Linux', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('window', {
      __TAURI__: { os: { platform: 'linux' } },
    });
    expect(getPlatform()).toBe('linux');
  });
});

// isDesktop / isMobile / isWindows / isLinux (platform wrappers)

describe('isDesktop()', () => {
  it('should return true on Windows', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'win32' });
    expect(isDesktop()).toBe(true);
  });

  it('should return true on Linux', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'linux' });
    expect(isDesktop()).toBe(true);
  });

  it('should return false on Android', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', userAgent: '' });
    expect(isDesktop()).toBe(false);
  });
});

describe('isMobile()', () => {
  it('should return true on Android', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', userAgent: '' });
    expect(isMobile()).toBe(true);
  });

  it('should return false on Windows', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'win32' });
    expect(isMobile()).toBe(false);
  });

  it('should return false on Linux', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'linux' });
    expect(isMobile()).toBe(false);
  });
});

describe('isWindows()', () => {
  it('should return true on Windows', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'win32' });
    expect(isWindows()).toBe(true);
  });

  it('should return false on Linux', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'linux' });
    expect(isWindows()).toBe(false);
  });

  it('should return false on Android', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', userAgent: '' });
    expect(isWindows()).toBe(false);
  });
});

describe('isLinux()', () => {
  it('should return true on Linux', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'linux' });
    expect(isLinux()).toBe(true);
  });

  it('should return false on Windows', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('process', { platform: 'win32' });
    expect(isLinux()).toBe(false);
  });

  it('should return false on Android', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', userAgent: '' });
    expect(isLinux()).toBe(false);
  });
});

// generateId

describe('generateId()', () => {
  it('should return a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('should return unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('should include the prefix when provided', () => {
    const id = generateId('task');
    expect(id.startsWith('task_')).toBe(true);
  });

  it('should not start with underscore when prefix is empty', () => {
    const id = generateId();
    expect(id.startsWith('_')).toBe(false);
  });

  it('should have alphanumeric characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

// generatePairingCode

describe('generatePairingCode()', () => {
  it('should return a string of length 6', () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
  });

  it('should return unique values on successive calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generatePairingCode()));
    expect(codes.size).toBe(100);
  });

  it('should only contain valid characters (no I, O, 0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('should be uppercase', () => {
    const code = generatePairingCode();
    expect(code).toBe(code.toUpperCase());
  });
});

// truncate

describe('truncate()', () => {
  it('should return the original string if within maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate with ellipsis when exceeding maxLength', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should return empty string when given empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('should handle exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('should keep exactly maxLength characters', () => {
    const result = truncate('a very long string', 10);
    expect(result).toHaveLength(10);
  });
});

// capitalize

describe('capitalize()', () => {
  it('should capitalize the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('should not change already capitalized words', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('should handle single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('should not change the rest of the string', () => {
    expect(capitalize('hello WORLD')).toBe('Hello WORLD');
  });
});

// camelToKebab / kebabToCamel

describe('camelToKebab()', () => {
  it('should convert camelCase to kebab-case', () => {
    expect(camelToKebab('helloWorld')).toBe('hello-world');
  });

  it('should handle multiple uppercase letters', () => {
    expect(camelToKebab('getUserById')).toBe('get-user-by-id');
  });

  it('should handle single word', () => {
    expect(camelToKebab('hello')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(camelToKebab('')).toBe('');
  });

  it('should handle leading uppercase', () => {
    expect(camelToKebab('HelloWorld')).toBe('hello-world');
  });
});

describe('kebabToCamel()', () => {
  it('should convert kebab-case to camelCase', () => {
    expect(kebabToCamel('hello-world')).toBe('helloWorld');
  });

  it('should handle multiple hyphens', () => {
    expect(kebabToCamel('get-user-by-id')).toBe('getUserById');
  });

  it('should handle single word', () => {
    expect(kebabToCamel('hello')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(kebabToCamel('')).toBe('');
  });

  it('should round-trip with camelToKebab', () => {
    const original = 'myVariableName';
    expect(kebabToCamel(camelToKebab(original))).toBe(original);
  });
});

// clamp

describe('clamp()', () => {
  it('should return value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should clamp to min when below bounds', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should clamp to max when above bounds', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should handle equal bounds', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  it('should handle negative ranges', () => {
    expect(clamp(-10, -20, -5)).toBe(-10);
  });
});

// randomInt

describe('randomInt()', () => {
  it('should return an integer', () => {
    const val = randomInt(0, 100);
    expect(Number.isInteger(val)).toBe(true);
  });

  it('should be within bounds (inclusive)', () => {
    for (let i = 0; i < 500; i++) {
      const val = randomInt(0, 10);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it('should return min when min equals max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('should produce a range of values over many calls', () => {
    const values = new Set(Array.from({ length: 200 }, () => randomInt(1, 6)));
    expect(values.size).toBeGreaterThan(1);
  });

  it('should handle negative ranges', () => {
    const val = randomInt(-10, -1);
    expect(val).toBeGreaterThanOrEqual(-10);
    expect(val).toBeLessThanOrEqual(-1);
  });
});

// chunk

describe('chunk()', () => {
  it('should split array into chunks of given size', () => {
    const result = chunk([1, 2, 3, 4, 5, 6], 2);
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('should handle last incomplete chunk', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('should handle size larger than array length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('should handle size of 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('should work with strings', () => {
    const result = chunk(['a', 'b', 'c', 'd'], 3);
    expect(result).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('should throw an error for size <= 0', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow('Chunk size must be greater than 0');
    expect(() => chunk([1, 2, 3], -5)).toThrow('Chunk size must be greater than 0');
  });
});

// unique

describe('unique()', () => {
  it('should remove duplicates from array', () => {
    expect(unique([1, 2, 2, 3, 1, 4])).toEqual([1, 2, 3, 4]);
  });

  it('should work with strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('should handle empty array', () => {
    expect(unique([])).toEqual([]);
  });

  it('should preserve insertion order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('should work with mixed types', () => {
    expect(unique([1, '1', 1, '1'])).toEqual([1, '1']);
  });
});

// groupBy

describe('groupBy()', () => {
  it('should group elements by key function', () => {
    const items = [
      { type: 'fruit', name: 'apple' },
      { type: 'fruit', name: 'banana' },
      { type: 'veg', name: 'carrot' },
    ];
    const result = groupBy(items, (item) => item.type);
    expect(result).toEqual({
      fruit: [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
      ],
      veg: [{ type: 'veg', name: 'carrot' }],
    });
  });

  it('should handle empty array', () => {
    expect(groupBy([], (x: string) => x)).toEqual({});
  });

  it('should handle single element', () => {
    expect(groupBy(['a'], (x) => x)).toEqual({ a: ['a'] });
  });

  it('should preserve insertion order within groups', () => {
    const items = [1, 2, 3, 1, 2];
    const result = groupBy(items, (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(result.odd).toEqual([1, 3, 1]);
    expect(result.even).toEqual([2, 2]);
  });
});

// pick / omit

describe('pick()', () => {
  it('should pick specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('should ignore keys that do not exist', () => {
    const obj = { a: 1 };
    expect(pick(obj, ['a', 'b' as keyof typeof obj])).toEqual({ a: 1 });
  });

  it('should handle empty keys array', () => {
    expect(pick({ a: 1, b: 2 }, [])).toEqual({});
  });

  it('should handle empty object', () => {
    expect(pick({}, ['a' as never])).toEqual({});
  });
});

describe('omit()', () => {
  it('should omit specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['a', 'c'])).toEqual({ b: 2 });
  });

  it('should return original if no keys omitted', () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
  });

  it('should handle all keys omitted', () => {
    expect(omit({ a: 1 }, ['a'])).toEqual({});
  });

  it('should not mutate the original object', () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, ['a']);
    expect(result).toEqual({ b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  it('should round-trip with pick', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const omited = omit(obj, ['b']);
    const picked = pick(obj, ['a', 'c']);
    expect(omited).toEqual(picked);
  });
});

// sleep

describe('sleep()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should resolve after the specified delay', async () => {
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('should not resolve before the delay', async () => {
    let resolved = false;
    const promise = sleep(1000).then(() => {
      resolved = true;
    });
    vi.advanceTimersByTime(500);
    await vi.waitUntil(() => Promise.resolve(false), { timeout: 100 }).catch(() => {});
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(500);
    await promise;
    expect(resolved).toBe(true);
  });

  it('should handle zero delay', async () => {
    const promise = sleep(0);
    vi.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });
});

// retry

describe('retry()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retry(fn, 3, 100);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');
    const promise = retry(fn, 3, 100).catch(() => {}); // prevent unhandled rejection
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting all attempts', async () => {
    const error = new Error('persistent error');
    const fn = vi.fn().mockRejectedValue(error);
    const promise = retry(fn, 3, 100);
    const assertion = expect(promise).rejects.toThrow('persistent error');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff (delay * attempt)', async () => {
    vi.useRealTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');
    const start = Date.now();
    const result = await retry(fn, 3, 10);
    const elapsed = Date.now() - start;
    expect(result).toBe('ok');
    // delayMs * 1 + delayMs * 2 = 10 + 20 = 30ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(25);
  }, 10000);

  it('should wrap non-Error throws in Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    const promise = retry(fn, 1, 100);
    const assertion = expect(promise).rejects.toThrow('string error');
    await assertion;
  });

  it('should use default maxAttempts and delayMs', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn);
    const assertion = expect(promise).rejects.toThrow('fail');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw an error for maxAttempts < 1', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retry(fn, 0, 100);
    await expect(promise).rejects.toThrow('maxAttempts must be at least 1');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should throw an error for delayMs < 0', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retry(fn, 3, -50);
    await expect(promise).rejects.toThrow('delayMs must be non-negative');
    expect(fn).not.toHaveBeenCalled();
  });
});

// isValidUrl

describe('isValidUrl()', () => {
  it('should return true for valid http URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('should return true for valid https URL', () => {
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('should return true for ws protocol', () => {
    expect(isValidUrl('ws://localhost:8080')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('should return false for random text', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('should return false for missing protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });
});

// isValidApiKey

describe('isValidApiKey()', () => {
  it('should return true for valid API key', () => {
    expect(isValidApiKey('test-abc123def456')).toBe(true);
  });

  it('should return false for short key (< 8 chars)', () => {
    expect(isValidApiKey('abc')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidApiKey('')).toBe(false);
  });

  it('should return false if key contains spaces', () => {
    expect(isValidApiKey('sk-abc 123')).toBe(false);
  });

  it('should return true for exactly 8 characters', () => {
    expect(isValidApiKey('12345678')).toBe(true);
  });

  it('should return true for string values longer than 8 chars without spaces', () => {
    expect(isValidApiKey('abcdefgh')).toBe(true);
    expect(isValidApiKey('test-abcdef123456')).toBe(true);
  });
});

// formatDate

describe('formatDate()', () => {
  it('should format a Date object as YYYY-MM-DD HH:mm:ss', () => {
    const date = new Date('2025-06-15T10:30:45.000Z');
    expect(formatDate(date)).toBe('2025-06-15 10:30:45');
  });

  it('should accept a timestamp number', () => {
    const ts = new Date('2025-06-15T10:30:45.000Z').getTime();
    expect(formatDate(ts)).toBe('2025-06-15 10:30:45');
  });

  it('should pad single-digit months and days', () => {
    const date = new Date('2025-01-05T01:02:03.000Z');
    expect(formatDate(date)).toBe('2025-01-05 01:02:03');
  });
});

// getRelativeTime

describe('getRelativeTime()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
  });

  it('should return "just now" for timestamps within the same minute', () => {
    const now = Date.now();
    expect(getRelativeTime(now - 5000)).toBe('just now');
  });

  it('should return "Xm ago" for timestamps in the past hour', () => {
    expect(getRelativeTime(Date.now() - 5 * 60 * 1000)).toBe('5m ago');
  });

  it('should return "Xh ago" for timestamps in the past day', () => {
    expect(getRelativeTime(Date.now() - 3 * 60 * 60 * 1000)).toBe('3h ago');
  });

  it('should return "Xd ago" for timestamps older than a day', () => {
    expect(getRelativeTime(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe('2d ago');
  });

  it('should handle future timestamps (negative diff)', () => {
    expect(getRelativeTime(Date.now() + 10000)).toBe('just now');
  });

  it('should round minutes correctly', () => {
    // 1 minute = 60000ms, so 90s -> 1 minute floor
    expect(getRelativeTime(Date.now() - 90 * 1000)).toBe('1m ago');
  });
});
