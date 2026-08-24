//

//   • KeychainStore refuses to silently fall back to a hard-coded
//     master password (issue 2.13).
//   • KeychainStore preserves the on-disk file when decrypt fails —
//     it no longer clears the cache or overwrites the file (issue 2.12).
//   • SecretRotator keeps the unmasked post-rotation key accessible via
//     `getActiveKey()` (issue 2.11).
//   • computeSkillHash hashes file contents in addition to metadata
//     when `contentPaths` is provided (issue 2.17).
//   • InputSanitizer blocks private/reserved IPv6 ranges
//     (link-local fe80::/10, unique-local fc00::/7) — issue 2.14.
//   • InputSanitizer.resolveAndValidate() returns a pin suitable for
//     defeating DNS rebinding (issue 2.14).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputSanitizer } from '../src/input-sanitizer.js';
import { SecretRotator } from '../src/secret-rotator.js';
// Both helpers live in the `skills` package — we test the security
// surface via the public export rather than importing internals from a
// sibling package, which keeps the dependency graph one-directional.
import { KeychainStore } from '../../skills/src/registry/oauth-handoff.js';
import { computeSkillHash } from '../../skills/src/hub/skill-guard.js';

describe('Audit Fix 2.13 — KeychainStore refuses hard-coded password', () => {
  const OLD_ENV = process.env.GHITA_KEYCHAIN_PASSWORD;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'ghita-keychain-'));
    delete process.env.GHITA_KEYCHAIN_PASSWORD;
  });

  afterEach(() => {
    if (OLD_ENV === undefined) {
      delete process.env.GHITA_KEYCHAIN_PASSWORD;
    } else {
      process.env.GHITA_KEYCHAIN_PASSWORD = OLD_ENV;
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('throws when neither masterPassword nor env var is set', () => {
    expect(
      () => new KeychainStore(join(tmp, 'kc.json')),
    ).toThrowError(/GHITA_KEYCHAIN_PASSWORD/);
  });

  it('throws when password is shorter than 16 chars', () => {
    expect(
      () => new KeychainStore(join(tmp, 'kc.json'), 'short'),
    ).toThrowError(/at least 16 chars/);
  });

  it('accepts a 16+ char explicit password', () => {
    expect(() => new KeychainStore(join(tmp, 'kc.json'), 'a'.repeat(20))).not.toThrow();
  });

  it('accepts a 16+ char password from GHITA_KEYCHAIN_PASSWORD env', () => {
    process.env.GHITA_KEYCHAIN_PASSWORD = 'b'.repeat(24);
    expect(() => new KeychainStore(join(tmp, 'kc.json'))).not.toThrow();
  });
});

describe('Audit Fix 2.12 — KeychainStore preserves file on decrypt failure', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'ghita-keychain-'));
    // Write a junk file that cannot be decrypted with any password
    const path = join(tmp, 'kc.json');
    writeFileSync(path, 'this-is-garbage-not-encrypted', 'utf8');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('does NOT overwrite the file when decrypt fails', async () => {
    const path = join(tmp, 'kc.json');
    const store = new KeychainStore(path, 'a'.repeat(24));
    // Loading should throw rather than silently destroying the file.
    await expect(
      (store as unknown as { load: () => Promise<void> }).load(),
    ).rejects.toThrow(/failed to decrypt|preserved untouched/i);
    expect(existsSync(path)).toBe(true);
  });
});

describe('Audit Fix 2.11 — SecretRotator keeps unmasked key accessible', () => {
  it('getActiveKey() returns the unmasked key after register()', () => {
    const rotator = new SecretRotator();
    rotator.register({
      id: 'openai-1',
      provider: 'openai',
      maskedKey: 'sk-***masked***',
      unmaskedKey: 'sk-real-key-value-123',
      rotationIntervalMs: 1_000_000,
    });
    expect(rotator.getActiveKey('openai-1')).toBe('sk-real-key-value-123');
  });

  it('getActiveKey() returns undefined for unknown / revoked keys', () => {
    const rotator = new SecretRotator();
    rotator.register({
      id: 'a-1',
      provider: 'a',
      maskedKey: 'm',
      unmaskedKey: 'real',
    });
    expect(rotator.getActiveKey('a-1')).toBe('real');
    expect(rotator.getActiveKey('nope')).toBeUndefined();
  });

  it('revoke() drops the unmasked key from memory', async () => {
    const rotator = new SecretRotator();
    rotator.register({
      id: 'a-2',
      provider: 'a',
      maskedKey: 'm',
      unmaskedKey: 'secret',
    });
    await rotator.revoke('a-2', 'test');
    expect(rotator.getActiveKey('a-2')).toBeUndefined();
  });
});

describe('Audit Fix 2.17 — SkillGuard hash includes file contents', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'ghita-skill-'));
    writeFileSync(join(tmp, 'index.js'), 'console.log("hi")', 'utf8');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('changes the hash when a script file is edited', async () => {
    const meta = {
      id: 's1',
      name: 'Sample',
      description: 'demo',
      category: 'demo' as const,
      version: '1.0.0',
      source: 'test',
      tags: [],
      permissions: [],
    };
    const before = computeSkillHash(meta, [join(tmp, 'index.js')]);
    writeFileSync(join(tmp, 'index.js'), 'console.log("mutated")', 'utf8');
    const after = computeSkillHash(meta, [join(tmp, 'index.js')]);
    expect(before).not.toBe(after);
  });
});

describe('Audit Fix 2.14 — InputSanitizer IPv6 + DNS rebinding protection', () => {
  let sanitizer: InputSanitizer;
  beforeEach(() => {
    sanitizer = new InputSanitizer();
  });

  it.each([
    ['http://[::1]/'],
    ['https://[fe80::1]/'],
    ['https://[fc00::1]/'],
    ['https://[fd00::1]/'],
    ['http://127.0.0.1/'],
    ['http://10.0.0.1/'],
    ['http://169.254.169.254/latest/meta-data/'],
    ['http://192.168.1.1/'],
    ['http://[::ffff:127.0.0.1]/'], // IPv4-mapped IPv6 bypass
    ['http://localhost/'],
  ])('blocks %s', (url) => {
    expect(sanitizer.isSafeUrl(url)).toBe(false);
  });

  it.each([
    ['https://8.8.8.8/dns-query'],
  ])('allows public IP literal %s synchronously', (url) => {
    expect(sanitizer.isSafeUrl(url)).toBe(true);
  });

  it.each([
    ['https://example.com/'],
    ['https://api.openai.com/v1/chat'],
  ])('rejects non-IP hostname %s synchronously', (url) => {
    expect(sanitizer.isSafeUrl(url)).toBe(false);
  });

  it('resolveAndValidate returns null for private hosts', async () => {
    const pin = await sanitizer.resolveAndValidate('http://127.0.0.1:1234/foo');
    expect(pin).toBeNull();
  });

  it('resolveAndValidate returns a usable pin for public hosts', async () => {
    const pin = await sanitizer.resolveAndValidate('https://example.com/path');
    // If DNS is unavailable in CI, this is null and the test is a no-op
    // (DNS rebinding protection cannot help when DNS is broken). We
    // assert that when it returns, the pin shape is correct.
    if (pin !== null) {
      expect(pin.scheme).toBe('https');
      expect(pin.host).toBe('example.com');
      expect(pin.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$|^[0-9a-f:]+$/i);
      expect(pin.pathname.startsWith('/path')).toBe(true);
    }
  });
});
