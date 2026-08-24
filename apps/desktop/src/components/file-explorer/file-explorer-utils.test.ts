// Tests for File Explorer utilities (rename path + language/binary detection)

import { describe, it, expect } from 'vitest';
import { renamePath, detectLanguage, isBinaryFile } from './file-explorer-utils';

describe('renamePath', () => {
  it('renames within the same POSIX directory', () => {
    expect(renamePath('/home/user/proj/old.ts', 'new.ts')).toBe('/home/user/proj/new.ts');
  });

  it('preserves Windows backslash separators', () => {
    expect(renamePath('C:\\proj\\src\\old.ts', 'new.ts')).toBe('C:\\proj\\src\\new.ts');
  });

  it('trims surrounding whitespace in the new name', () => {
    expect(renamePath('/a/b/old.ts', '  new.ts  ')).toBe('/a/b/new.ts');
  });

  it('returns null for an empty name', () => {
    expect(renamePath('/a/b/old.ts', '   ')).toBeNull();
  });

  it('rejects names containing path separators (no directory escape)', () => {
    expect(renamePath('/a/b/old.ts', '../evil.ts')).toBeNull();
    expect(renamePath('/a/b/old.ts', 'sub/new.ts')).toBeNull();
    expect(renamePath('C:\\a\\old.ts', 'sub\\new.ts')).toBeNull();
  });

  it('returns the basename when the path has no directory part', () => {
    expect(renamePath('old.ts', 'new.ts')).toBe('new.ts');
  });
});

describe('detectLanguage', () => {
  it('maps common extensions', () => {
    expect(detectLanguage('a.ts')).toBe('typescript');
    expect(detectLanguage('a.rs')).toBe('rust');
    expect(detectLanguage('a.py')).toBe('python');
  });

  it('handles special filenames and lock files', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('pnpm-lock.yaml')).toBe('yaml');
    expect(detectLanguage('unknown.zzz')).toBe('plaintext');
  });
});

describe('isBinaryFile', () => {
  it('flags binary extensions and passes text ones', () => {
    expect(isBinaryFile('image.png')).toBe(true);
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('code.ts')).toBe(false);
  });
});
