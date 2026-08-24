//
// This module re-exports the Tauri-native operator and shared utilities for
// server-side (Node.js) consumers. The legacy NutJS adapter has been removed;
// all native screen capture / mouse / keyboard operations now go through the
// Rust backend via Tauri IPC.

import type { ScreenCapture } from './index.js';

export { DSOOrchestrator } from './sandbox/dsoOrchestrator.js';
export { SandboxSecurityFilter } from './guardrails/sandboxFilter.js';
export { SandboxLogger } from './sandbox/sandboxLogger.js';
export { SecurityLogger } from './guardrails/securityLogger.js';
export {
  SandboxValidationReporter,
  type SandboxValidationReport,
  type ValidationResult,
} from './sandboxValidationReporter.js';
export * from './guardrails/index.js';
export { createTauriAdapter, TauriOperator, isTauriAvailable } from './operators/tauri.js';

/**
 * Encode an arbitrary native capture result into the portable ScreenCapture
 * format. Handles string (base64 already), Uint8Array (raw bytes), and
 * generic objects (serialized as JSON).
 */
interface NutScreenCapture {
  data?: Buffer | Uint8Array | string;
  width?: number;
  height?: number;
}

export function encodeCapture(capture: unknown): ScreenCapture {
  const typed = capture as NutScreenCapture;
  const raw = typed.data;

  if (typeof raw === 'string') {
    return {
      mimeType: 'image/png',
      data: raw,
      size: typed.width && typed.height ? { width: typed.width, height: typed.height } : undefined,
    };
  }

  if (raw instanceof Uint8Array) {
    return {
      mimeType: 'image/png',
      data: Buffer.from(raw).toString('base64'),
      size: typed.width && typed.height ? { width: typed.width, height: typed.height } : undefined,
    };
  }

  return {
    mimeType: 'application/json',
    data: Buffer.from(JSON.stringify(capture)).toString('base64'),
  };
}
