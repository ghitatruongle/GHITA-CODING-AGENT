// ==============================================================================
// GHITA CODING AGENT - Skill → npm Converter (Phase 37)
// ==============================================================================

import type { ConvertOptions, NpmPackageJson } from './types.js';

/** A single file produced by conversion */
export interface ConvertedFile {
  path: string;
  content: string;
}

/** Result of conversion */
export interface ConvertResult {
  /** package.json */
  packageJson: NpmPackageJson;
  /** All produced files */
  files: ConvertedFile[];
  /** Warnings collected */
  warnings: string[];
}

/**
 * Convert a marketplace skill (with SKILL.md + tools/) into an npm package layout.
 * Pure transformation — no filesystem writes, callers can persist the result.
 */
export class SkillToNpmConverter {
  private warnings: string[] = [];

  convert(
    skillId: string,
    version: string,
    sourceFiles: Map<string, string>,
    manifestDescription: string,
    options: ConvertOptions = {},
  ): ConvertResult {
    this.warnings = [];
    const files: ConvertedFile[] = [];

    const pkgName = options.packageName ?? this.derivePackageName(skillId);
    const filesList: string[] = [];
    const dependencies: Record<string, string> = {};
    const peerDependencies: Record<string, string> = {};

    for (const [path, content] of sourceFiles) {
      const normalized = path.replace(/\\/g, '/');
      filesList.push(normalized);
      files.push({ path: normalized, content });

      if (normalized === 'SKILL.md') continue;
      if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) {
        const imports = this.extractBareImports(content);
        for (const imp of imports) {
          if (this.isStdLib(imp)) continue;
          if (imp.startsWith('.') || imp.startsWith('/')) continue;
          const [pkg, sub] = this.splitPackage(imp);
          if (!pkg) continue;
          if (sub && !sub.startsWith('.')) {
            peerDependencies[pkg] = peerDependencies[pkg] ?? '^1.0.0';
          } else {
            dependencies[pkg] = dependencies[pkg] ?? '^1.0.0';
          }
        }
      }
    }

    if (!filesList.includes('package.json')) {
      this.warnings.push('No package.json in source — generating default');
    }

    const packageJson: NpmPackageJson = {
      name: pkgName,
      version,
      description: manifestDescription,
      main: this.detectEntry(sourceFiles) ?? 'index.js',
      files: filesList,
      ...(options.sourceMaps ? { scripts: { build: 'tsc -b', prepare: 'npm run build' } } : {}),
      keywords: [skillId, 'ghita', 'skill', 'agent'],
      ...(options.author ? { author: options.author } : {}),
      ...(options.license ? { license: options.license } : {}),
      ...(options.repository ? { repository: { type: 'git', url: options.repository } } : {}),
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
      ...(Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}),
    };

    files.unshift({ path: 'package.json', content: JSON.stringify(packageJson, null, 2) + '\n' });

    return { packageJson, files, warnings: [...this.warnings] };
  }

  private derivePackageName(skillId: string): string {
    const safe = skillId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    return `@ghita/skills/${safe || 'unnamed-skill'}`;
  }

  private detectEntry(files: Map<string, string>): string | undefined {
    if (files.has('index.ts')) return 'index.js';
    if (files.has('index.js')) return 'index.js';
    if (files.has('src/index.ts')) return 'dist/index.js';
    if (files.has('src/index.js')) return 'src/index.js';
    return undefined;
  }

  private extractBareImports(src: string): string[] {
    const out = new Set<string>();
    const re = /(?:^|[^.\w])import\s+(?:.+?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const spec = m[1] ?? m[2];
      if (spec) out.add(spec);
    }
    return Array.from(out);
  }

  private splitPackage(spec: string): [string, string | undefined] {
    if (spec.startsWith('@')) {
      const parts = spec.split('/');
      return [parts.slice(0, 2).join('/'), parts[2]];
    }
    const idx = spec.indexOf('/');
    return idx === -1 ? [spec, undefined] : [spec.slice(0, idx), spec.slice(idx + 1)];
  }

  private isStdLib(pkg: string): boolean {
    return ['node:fs', 'node:path', 'node:crypto', 'fs', 'path', 'crypto', 'url', 'util', 'events', 'stream'].includes(pkg);
  }
}
