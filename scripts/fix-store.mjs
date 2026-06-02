/**
 * fix-store.mjs
 * Fixes pnpm store corruption after `pnpm store prune`.
 * Checks packages in node_modules/.pnpm for missing dist/ directories
 * and removes them so pnpm install can re-download.
 */
import fs from 'fs';
import path from 'path';

const PNPM_DIR = 'node_modules/.pnpm';
let fixed = 0;

if (!fs.existsSync(PNPM_DIR)) process.exit(0);

for (const entry of fs.readdirSync(PNPM_DIR)) {
  const pkgDir = path.join(PNPM_DIR, entry, 'node_modules');
  if (!fs.existsSync(pkgDir)) continue;

  for (const name of fs.readdirSync(pkgDir)) {
    // Handle scoped packages: @scope/name
    const scopeDir = path.join(pkgDir, name);
    const entries = name.startsWith('@')
      ? fs.readdirSync(scopeDir).map(sub => ({ name: `${name}/${sub}`, path: path.join(scopeDir, sub) }))
      : [{ name, path: scopeDir }];

    for (const { name: modName, path: modPath } of entries) {
      try {
        if (!fs.statSync(modPath).isDirectory()) continue;
        const distPath = path.join(modPath, 'dist');
        if (fs.existsSync(distPath)) continue;

        const pjPath = path.join(modPath, 'package.json');
        if (!fs.existsSync(pjPath)) continue;
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));

        // Only fix packages whose main/types point to dist/
        if ((pj.main && pj.main.includes('dist/')) || (pj.types && pj.types.includes('dist/'))) {
          console.log(`[fix-store] Removing corrupted: ${modName}@${pj.version || '?'}`);
          fs.rmSync(modPath, { recursive: true, force: true });
          fixed++;
        }
      } catch {
        // Skip unreadable entries (broken symlinks etc.)
      }
    }
  }
}

if (fixed > 0) {
  console.log(`[fix-store] Fixed ${fixed} corrupted package(s). pnpm install will re-download.`);
} else {
  console.log('[fix-store] No corrupted packages found.');
}
