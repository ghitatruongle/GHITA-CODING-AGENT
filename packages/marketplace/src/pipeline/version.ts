import type { BumpKind, SemverVersion } from './types.js';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;

/**
 * Parse / serialize / bump semver versions.
 */
export class Semver {
  /**
   * Parse a semver string. Throws on invalid input.
   */
  parse(v: string): SemverVersion {
    const match = SEMVER_RE.exec(v.trim());
    if (!match) throw new Error(`Invalid semver: ${v}`);
    const [, M = '0', m = '0', p = '0', pre, build] = match;
    const out: SemverVersion = {
      major: parseInt(M, 10),
      minor: parseInt(m, 10),
      patch: parseInt(p, 10),
    };
    if (pre) out.prerelease = pre;
    if (build) out.build = build;
    return out;
  }

  /**
   * Try to parse, return undefined on failure.
   */
  tryParse(v: string): SemverVersion | undefined {
    try {
      return this.parse(v);
    } catch {
      return undefined;
    }
  }

  /**
   * Serialize back to string.
   */
  stringify(v: SemverVersion): string {
    let s = `${v.major}.${v.minor}.${v.patch}`;
    if (v.prerelease) s += `-${v.prerelease}`;
    if (v.build) s += `+${v.build}`;
    return s;
  }

  /**
   * Bump a version by kind.
   */
  bump(v: string, kind: BumpKind, prereleaseId?: string): string {
    const cur = this.parse(v);
    switch (kind) {
      case 'major':
        return this.stringify({ ...cur, major: cur.major + 1, minor: 0, patch: 0 });
      case 'minor':
        return this.stringify({ ...cur, minor: cur.minor + 1, patch: 0 });
      case 'patch':
        return this.stringify({ ...cur, patch: cur.patch + 1 });
      case 'prerelease':
        return this.stringify({ ...cur, prerelease: prereleaseId ?? 'rc.0' });
    }
  }

  /**
   * Compare two versions. Returns -1, 0, 1.
   */
  compare(a: string, b: string): -1 | 0 | 1 {
    const va = this.parse(a);
    const vb = this.parse(b);
    if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
    if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
    if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
    return 0;
  }

  /**
   * Whether v1 is greater than v2.
   */
  gt(a: string, b: string): boolean {
    return this.compare(a, b) === 1;
  }

  /**
   * Whether a version is a prerelease.
   */
  isPrerelease(v: string): boolean {
    return this.parse(v).prerelease !== undefined;
  }

  /**
   * Suggest next version based on a list of commits (conventional commits).
   */
  suggestNext(currentVersion: string, commits: string[]): string {
    let bump: BumpKind = 'patch';
    for (const c of commits) {
      const lower = c.toLowerCase();
      if (lower.startsWith('breaking:') || lower.includes('!:') || lower.startsWith('feat!:')) {
        return this.bump(currentVersion, 'major');
      }
      if (lower.startsWith('feat:') || lower.startsWith('feat(')) {
        bump = 'minor';
      }
    }
    return this.bump(currentVersion, bump);
  }
}
