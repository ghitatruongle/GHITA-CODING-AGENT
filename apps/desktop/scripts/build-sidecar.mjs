import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const sidecarDir = resolve(appRoot, 'src-tauri', 'sidecar');
const require = createRequire(import.meta.url);

mkdirSync(sidecarDir, { recursive: true });

await build({
  entryPoints: [resolve(sidecarDir, 'server.mjs')],
  outfile: resolve(sidecarDir, 'server.bundle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'warning',
  external: ['*.node', 'chromium-bidi/*', '../build/Release/cpufeatures.node'],
  banner: {
    js: [
      "import { createRequire } from 'module';",
      "import { fileURLToPath } from 'url';",
      "import { dirname as __ghitaDirname } from 'path';",
      'const require = createRequire(import.meta.url);',
      'const __filename = fileURLToPath(import.meta.url);',
      'const __dirname = __ghitaDirname(__filename);',
    ].join(''),
  },
});

const screenshotDesktopRoot = dirname(require.resolve('screenshot-desktop'));
for (const asset of ['screenCapture_1.3.2.bat', 'app.manifest']) {
  const source = resolve(screenshotDesktopRoot, 'lib', 'win32', asset);
  if (existsSync(source)) {
    copyFileSync(source, resolve(sidecarDir, asset));
  }
}

if (process.platform === 'win32') {
  const bundledNode = resolve(sidecarDir, 'node.exe');
  if (!existsSync(bundledNode) || process.env.GHITA_REFRESH_NODE_EXE === '1') {
    copyFileSync(process.execPath, bundledNode);
  }
}
