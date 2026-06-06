// ==============================================================================
// GHITA CODING AGENT - Cross-Platform Screenshot Capturer (Phase 18)
// ==============================================================================
//
// ScreenshotCapturer is the only place that knows about OS-level screen
// capture. It tries a series of well-known capture backends in order:
//
//   1. PowerShell + System.Drawing (Windows, no extra deps)
//   2. screencapture (macOS, ships with the OS)
//   3. ImageMagick `import` (Linux X11)
//   4. xwd (Linux X11 fallback)
//   5. Mock (returns a deterministic 1x1 PNG for tests / headless CI)
//
// The capturer is intentionally written as a SINGLE function rather than a
// class so that it can be called from background tasks (ReAct loop) without
// `this`-binding issues. The result is normalised to { mimeType, data, size }
// and the size hint is clamped to `maxEdge` (default 1920 px) so the ReAct
// loop can decide whether to call into NutJSOperator for a real downscale.
//
// We deliberately do NOT use Puppeteer / Playwright here: this file is the
// screenshot pipeline for native OS automation, the browser stack lives
// elsewhere (see browser-control package).
// ==============================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScreenCapture, ScreenSize } from '../index.js';

const execFileAsync = promisify(execFile);

export const MAX_EDGE_DEFAULT = 1920;

export interface CaptureOptions {
  /** Longest edge after resize; default 1920. */
  maxEdge?: number;
  /** Override output mime type; default 'image/png'. */
  mimeType?: 'image/png' | 'image/jpeg';
  /** JPEG quality 0-1 when mimeType=jpeg. */
  quality?: number;
  /** When true, returns a synthetic gradient (useful for tests). */
  mock?: boolean;
}

export type ScreenshotBackend =
  | 'powershell'
  | 'screencapture'
  | 'imagemagick'
  | 'xwd'
  | 'mock'
  | 'none';

export interface BackendProbe {
  backend: ScreenshotBackend;
  reason?: string;
}

/**
 * Detect a usable screen capture backend. The check is cheap (binary
 * presence + version probe with short timeout) and is the single source of
 * truth used by the capturer. NutJS is intentionally NOT probed here: the
 * binary load is heavy and is owned by NutJSOperator.
 */
export async function detectScreenshotBackend(): Promise<BackendProbe> {
  // 2. Windows PowerShell
  if (process.platform === 'win32') {
    try {
      await execFileAsync('powershell', ['-NoProfile', '-Command', 'exit 0'], { timeout: 1500 });
      return { backend: 'powershell' };
    } catch (e) {
      return { backend: 'none', reason: `powershell unavailable: ${(e as Error).message}` };
    }
  }

  // 3. macOS
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('screencapture', ['-h'], { timeout: 1500 });
      return { backend: 'screencapture' };
    } catch (e) {
      return { backend: 'none', reason: `screencapture unavailable: ${(e as Error).message}` };
    }
  }

  // 4. Linux — try ImageMagick then xwd
  if (process.platform === 'linux') {
    try {
      await execFileAsync('import', ['-version'], { timeout: 1500 });
      return { backend: 'imagemagick' };
    } catch {
      // not fatal, try xwd
    }
    try {
      await execFileAsync('xwd', ['-h'], { timeout: 1500 });
      return { backend: 'xwd' };
    } catch (e) {
      return { backend: 'none', reason: `no linux capture tool: ${(e as Error).message}` };
    }
  }

  return { backend: 'none', reason: 'unsupported platform' };
}

/**
 * Generate a deterministic 1x1 transparent PNG. Used as a fallback when no
 * real backend is available so the ReAct loop can still be exercised in CI
 * and unit tests.
 */
export async function mockScreenshot(
  size: ScreenSize = { width: 640, height: 360 },
): Promise<ScreenCapture> {
  const pixel = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
    0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc,
    0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xfe, 0xa7, 0xcf, 0x6e, 0x48, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return {
    mimeType: 'image/png',
    data: pixel.toString('base64'),
    size,
  };
}

/**
 * Run a capture using the best available backend. Returns a real screenshot
 * when possible, otherwise falls back to the mock.
 */
export async function captureScreen(
  options: CaptureOptions = {},
): Promise<ScreenCapture> {
  if (options.mock) {
    return mockScreenshot();
  }

  const detected = await detectScreenshotBackend();

  switch (detected.backend) {
    case 'powershell':
      return captureViaPowerShell(options);
    case 'screencapture':
      return captureViaScreencapture(options);
    case 'imagemagick':
      return captureViaImageMagick(options);
    case 'xwd':
      return captureViaXwd(options);
    case 'mock':
    case 'none':
    default:
      return mockScreenshot();
  }
}

async function captureViaPowerShell(
  options: CaptureOptions,
): Promise<ScreenCapture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ghita-shot-'));
  const filePath = join(tempDir, 'screen.png');
  const psScript = [
    'Add-Type -AssemblyName System.Drawing,System.Windows.Forms',
    '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height",
    '$g=[System.Drawing.Graphics]::FromImage($bmp)',
    "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)",
    `$bmp.Save('${filePath.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png)`,
    'Write-Output $b.Width',
    'Write-Output $b.Height',
  ].join(';');

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-Command', psScript],
      { timeout: 10_000, windowsHide: true },
    );
    const [wStr = '0', hStr = '0'] = stdout.trim().split(/\r?\n/);
    const buf = await readFile(filePath);
    const size: ScreenSize = { width: Number(wStr) || 0, height: Number(hStr) || 0 };
    return finalizeCapture(buf, size, options);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function captureViaScreencapture(
  options: CaptureOptions,
): Promise<ScreenCapture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ghita-shot-'));
  const filePath = join(tempDir, 'screen.png');
  try {
    await execFileAsync('screencapture', ['-x', '-t', 'png', filePath], { timeout: 10_000 });
    const buf = await readFile(filePath);
    return finalizeCapture(buf, { width: 0, height: 0 }, options);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function captureViaImageMagick(
  options: CaptureOptions,
): Promise<ScreenCapture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ghita-shot-'));
  const filePath = join(tempDir, 'screen.png');
  try {
    await execFileAsync('import', ['-window', 'root', filePath], { timeout: 10_000 });
    const buf = await readFile(filePath);
    return finalizeCapture(buf, { width: 0, height: 0 }, options);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function captureViaXwd(options: CaptureOptions): Promise<ScreenCapture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ghita-shot-'));
  const xwdPath = join(tempDir, 'screen.xwd');
  const pngPath = join(tempDir, 'screen.png');
  try {
    await execFileAsync('xwd', ['-root', '-silent', '-out', xwdPath], { timeout: 10_000 });
    try {
      await execFileAsync('convert', [xwdPath, pngPath], { timeout: 5000 });
      const buf = await readFile(pngPath);
      return finalizeCapture(buf, { width: 0, height: 0 }, options);
    } catch {
      const buf = await readFile(xwdPath);
      return { mimeType: 'image/x-xwd', data: buf.toString('base64') };
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Validate the captured buffer, clamp the size hint, and base64-encode.
 * The full raster downscale lives in NutJSOperator (Jimp binding). This
 * helper exists so tests can call it with synthetic inputs.
 */
export async function finalizeCapture(
  buffer: Buffer,
  size: ScreenSize,
  options: CaptureOptions = {},
): Promise<ScreenCapture> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty screenshot buffer');
  }
  const maxEdge = options.maxEdge ?? MAX_EDGE_DEFAULT;
  const sizeHint: ScreenSize | undefined =
    size.width > 0 && size.height > 0
      ? {
          width: Math.min(size.width, maxEdge),
          height: Math.min(size.height, maxEdge),
        }
      : undefined;

  return {
    mimeType: options.mimeType ?? 'image/png',
    data: buffer.toString('base64'),
    size: sizeHint,
  };
}

/**
 * Pure helper: decide whether a capture needs resizing. The full resize
 * implementation lives in NutJSOperator (which has access to the
 * @nut-tree/nut-js Jimp binding). This function exists so the ReAct loop
 * can log "skipped resize" without dragging the binary in.
 */
export function resizeIfNeeded(
  size: ScreenSize | undefined,
  maxEdge: number = MAX_EDGE_DEFAULT,
): { needsResize: boolean; target: ScreenSize | undefined } {
  if (!size || size.width <= 0 || size.height <= 0) {
    return { needsResize: false, target: undefined };
  }
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge) {
    return { needsResize: false, target: size };
  }
  const ratio = maxEdge / longest;
  return {
    needsResize: true,
    target: {
      width: Math.round(size.width * ratio),
      height: Math.round(size.height * ratio),
    },
  };
}

/**
 * Undo DPI scaling: a HiDPI display may report 2880x1800 in OS coordinates
 * but a screenshot of the same desktop rendered at logical 1440x900. The
 * `scaleFactor` argument should come from the operator (e.g. nutjs's
 * `screen.config.dpi`). We do not divide by zero.
 */
export function undoDpiScale(
  size: ScreenSize,
  scaleFactor: number,
): ScreenSize {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return size;
  return {
    width: Math.round(size.width / scaleFactor),
    height: Math.round(size.height / scaleFactor),
  };
}
