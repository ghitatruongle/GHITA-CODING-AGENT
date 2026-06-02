import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
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
  external: ['*.node', 'chromium-bidi/*', '../build/Release/cpufeatures.node', 'node-pty', 'ioredis', '@opentelemetry/*'],
  banner: {
    js: [
      "import { createRequire as __ghitaCreateRequire } from 'module';",
      "import { fileURLToPath as __ghitaFileURLToPath } from 'url';",
      "import { dirname as __ghitaDirname } from 'path';",
      'const require = __ghitaCreateRequire(import.meta.url);',
      'const __filename = __ghitaFileURLToPath(import.meta.url);',
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

// Copy node-pty dependency to sidecar resource directory
const nodePtySource = resolve(appRoot, 'node_modules', 'node-pty');
const nodePtyDest = resolve(sidecarDir, 'node_modules', 'node-pty');
if (existsSync(nodePtySource)) {
  try {
    if (existsSync(nodePtyDest)) {
      rmSync(nodePtyDest, { recursive: true, force: true });
    }
    cpSync(nodePtySource, nodePtyDest, { recursive: true });
  } catch (err) {
    console.warn('Failed to copy node-pty dependency to sidecar directory:', err.message);
  }
}

// ── Patch conpty_console_list_agent.js ────────────────────────────────────
// node-pty's helper process calls AttachConsole() which can throw on Windows
// when the shell has already exited or the process runs headless. We wrap the
// call in a try/catch so it sends an empty list instead of crashing the node
// child process, which would bubble up as an unhandled exception in the server.
const conptyAgentPath = resolve(nodePtyDest, 'lib', 'conpty_console_list_agent.js');
if (existsSync(conptyAgentPath)) {
  try {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const original = readFileSync(conptyAgentPath, 'utf8');
    // Only patch if it hasn't already been patched
    if (!original.includes('AttachConsole can fail')) {
      const regex = /var consoleProcessList = getConsoleProcessList\(shellPid\);\s*process\.send\(\{ consoleProcessList: consoleProcessList \}\);/;
      if (!regex.test(original)) {
        console.warn('[build-sidecar] conpty-agent.js regex pattern did not match. Skipping patch.');
      } else {
        const patched = original
          .replace(
            regex,
            `try {
  var consoleProcessList = getConsoleProcessList(shellPid);
  process.send({ consoleProcessList: consoleProcessList });
} catch (e) {
  // AttachConsole can fail when the shell process has already exited or when
  // running in a headless / detached console environment. Send an empty list
  // so the parent doesn't hang waiting for a response.
  process.send({ consoleProcessList: [] });
}`
          );
        writeFileSync(conptyAgentPath, patched, 'utf8');
        console.log('✓ Patched conpty_console_list_agent.js (AttachConsole guard)');
      }
    }
  } catch (err) {
    console.warn('Failed to patch conpty_console_list_agent.js:', err.message);
  }
}

