// ==============================================================================
// GHITA CODING AGENT - Hooks Types
// ==============================================================================

/** Sự kiện kích hoạt hook */
export type HookEvent = 'pre_tool' | 'post_tool' | 'pre_response';

/** Matcher để xác định hook áp dụng cho tool nào */
export interface HookMatcher {
  tool?: string;
  glob?: string;
}

/** Cấu hình một hook */
export interface HookConfig {
  event: HookEvent;
  matcher: HookMatcher;
  command: string;
  timeoutMs?: number;
  enabled: boolean;
}

/** Kết quả chạy hook */
export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

/** Hook runner config */
export interface HookRunnerConfig {
  hooks: HookConfig[];
  enabled: boolean;
}
