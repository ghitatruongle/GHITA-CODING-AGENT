// ==============================================================================
// GHITA CODING AGENT - Operator Utilities (Phase 1 Rust Rewrite)
// ==============================================================================
//
// Pure helper functions used by TauriOperator and the ReAct loop.
// Previously these lived in screenshot.ts alongside the (now removed)
// PowerShell/child_process capture pipeline.
//
// The actual screen capture, mouse/keyboard control, and image resize are
// now handled natively by the Rust backend in computer_use.rs.
// ==============================================================================

import type { ScreenCapture, ScreenSize } from '../index.js';
import type { OperatorContext } from './types.js';

export const MAX_EDGE_DEFAULT = 1920;

/**
 * Undo DPI scaling: a HiDPI display may report 2880x1800 in OS coordinates
 * but a screenshot of the same desktop rendered at logical 1440x900. The
 * `scaleFactor` argument should come from the operator (e.g. the Rust
 * backend's `display_info.scale_factor`). We do not divide by zero.
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

/**
 * Pure helper: decide whether a capture needs resizing based on the longest
 * edge. The actual resize is done by the Rust backend via the `image` crate
 * Lanczos3 filter. This function exists so the ReAct loop can log "skipped
 * resize" without pulling in native code.
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
 * Generate a deterministic 1x1 transparent PNG. Used as a fallback when the
 * Rust backend is unavailable (CI, headless, tests).
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
 * Build a model-bound screenshot bundle: capture + size + resize decision.
 * The ReAct loop calls this once per iteration and ships the result to the
 * multimodal LLM.
 */
export async function buildScreenshotBundle(
  operator: { screenshot: (ctx?: OperatorContext) => Promise<ScreenCapture> },
  context?: OperatorContext,
): Promise<{
  capture: ScreenCapture;
  size: ScreenSize | undefined;
  resize: { needsResize: boolean; target: ScreenSize | undefined };
}> {
  const capture = await operator.screenshot(context);
  const resize = resizeIfNeeded(capture.size, context?.maxEdge);
  return { capture, size: capture.size, resize };
}
