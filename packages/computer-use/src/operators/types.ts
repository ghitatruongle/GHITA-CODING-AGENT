// ==============================================================================
// GHITA CODING AGENT - Operator Interface (Phase 18: Screenshot Pipeline)
// ==============================================================================
//
// Operator is the abstract contract for any input/output driver that the
// ComputerUseController can dispatch against. Concrete implementations include
// NutJSOperator (desktop, native), MobileAdbOperator (Android via adb),
// MockOperator (tests / CI without display server), and future headless
// drivers. The interface is intentionally narrow: capture, move, click, type,
// press. Anything more sophisticated (drag, scroll, multi-touch) is composed
// from these primitives in higher layers (e.g. ReAct loop, ActionParser).
//
// Design notes:
//   - All coordinates are PHYSICAL pixels in the OS coordinate space, not the
//     model coordinate space. Callers (grounding, ReAct loop) are responsible
//     for converting normalized model coordinates to physical pixels first.
//   - getScreenSize() returns the current display resolution so the ReAct loop
//     can decide when to retake the screenshot after a resolution change.
//   - screenshot() returns an image already encoded as base64 PNG by default
//     (mimeType: 'image/png'); the cross-platform ScreenshotCapturer is the
//     only place that talks to OS-level capture APIs.
// ==============================================================================

import type { MouseButton, Point, ScreenCapture, ScreenSize } from '../index.js';

export type OperatorKind = 'nutjs' | 'mobile-adb' | 'mock' | 'unknown';

export interface OperatorCapabilities {
  /** True if the driver can capture the screen. */
  readonly canScreenshot: boolean;
  /** True if the driver can drive a mouse cursor. */
  readonly canMouse: boolean;
  /** True if the driver can send keyboard input. */
  readonly canKeyboard: boolean;
  /** True if the driver supports DPI scaling (nutjs only on some platforms). */
  readonly supportsDpiScaling: boolean;
}

export interface OperatorHealth {
  /** Whether the underlying native module could be loaded. */
  readonly ready: boolean;
  /** Human-readable detail when ready=false. */
  readonly reason?: string;
  /** Identifier of the loaded driver, useful for telemetry. */
  readonly kind: OperatorKind;
  /** When the health probe was last evaluated (epoch ms). */
  readonly checkedAt: number;
}

export interface OperatorContext {
  /** Optional override for screen capture region; defaults to primary display. */
  region?: { x: number; y: number; width: number; height: number };
  /** DPI scale factor reported by the OS; defaults to 1.0. */
  scaleFactor?: number;
  /** Maximum capture resolution (longest edge) before resize. */
  maxEdge?: number;
}

/**
 * Operator is the abstract contract every desktop/mobile driver must satisfy.
 * Methods are async because some drivers (adb) shell out, and the rest still
 * need to release the JS event loop for the React UI to stay responsive.
 */
export interface Operator {
  /** Identifier for logs / metrics. */
  readonly kind: OperatorKind;

  /** Cheap capability probe used at startup. */
  getCapabilities(): OperatorCapabilities;

  /** Liveness probe (native module loaded, adb reachable, etc). */
  healthCheck(): Promise<OperatorHealth>;

  /** Get the current primary display size in physical pixels. */
  getScreenSize(): Promise<ScreenSize>;

  /** Capture a screenshot as PNG base64 + dimensions. */
  screenshot(context?: OperatorContext): Promise<ScreenCapture>;

  /** Move the mouse cursor to absolute physical coordinates. */
  moveMouse(point: Point): Promise<void>;

  /** Click at an absolute position (or current cursor if no point). */
  click(point?: Point, button?: MouseButton): Promise<void>;

  /** Type a string of text. Implementations may buffer to keep typing speed. */
  typeText(text: string): Promise<void>;

  /** Press and release a single key by its canonical name (e.g. 'Enter'). */
  pressKey(key: string): Promise<void>;

  /** Release any held resources (stop adb watchers, etc). */
  dispose(): Promise<void>;
}

/** Single iteration result emitted by the ReAct loop. */
export interface ReActStep {
  iteration: number;
  thought: string;
  action: {
    type: string;
    inputs: Record<string, unknown>;
  };
  observation?: {
    capture: ScreenCapture;
    capturedAt: number;
  };
  success: boolean;
  error?: string;
  /** Wall-clock duration for this iteration in ms. */
  durationMs: number;
}

/** Termination signal for the ReAct loop. */
export type ReActStopReason =
  | 'completed'        // model returned a finished/None action
  | 'max-iterations'   // hit the safety ceiling
  | 'unsupported'      // model returned an action we cannot execute
  | 'error';           // an action execution failed

export interface ReActRunResult {
  steps: ReActStep[];
  stopReason: ReActStopReason;
  totalIterations: number;
  startedAt: number;
  finishedAt: number;
}
