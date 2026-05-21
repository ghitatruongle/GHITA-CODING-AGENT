// ==============================================================================
// GHITA CODING AGENT - Built-in Slash Commands
// ==============================================================================

import type { SlashCommand } from './registry.js';

/** Tạo built-in slash commands */
export function createBuiltinSlashCommands(): SlashCommand[] {
  return [
    {
      name: 'Compact Context',
      description: 'Tóm tắt conversation để giải phóng token context window',
      trigger: '/compact',
      usage: '/compact',
      execute: async () => {
        return '[COMPACT] Đang tóm tắt conversation... Context sẽ được compact ở lần gọi AI tiếp theo.';
      },
    },
    {
      name: 'Clear Chat',
      description: 'Xóa toàn bộ lịch sử chat',
      trigger: '/clear',
      usage: '/clear',
      execute: async () => {
        return '[CLEAR] Đã xóa lịch sử chat.';
      },
    },
    {
      name: 'Help',
      description: 'Hiển thị danh sách commands có sẵn',
      trigger: '/help',
      usage: '/help',
      execute: async () => {
        return `[HELP] Các lệnh có sẵn:\n/compact — Tóm tắt context\n/clear — Xóa chat\n/help — Hiển thị trợ giúp\n/code-review [PR#] — Review code\n/feature-dev [tên] — Phát triển tính năng\n/deploy-check — Kiểm tra deploy`;
      },
    },
    {
      name: 'Code Review',
      description: 'Review code với multi-agent analysis',
      trigger: '/code-review',
      usage: '/code-review [PR # hoặc branch]',
      execute: async (args: string) => {
        return `[CODE-REVIEW] Bắt đầu review: ${args || 'current changes'}\nĐang phân tích với multi-agent pipeline...`;
      },
    },
    {
      name: 'Feature Development',
      description: 'Phát triển tính năng theo 7-phase workflow',
      trigger: '/feature-dev',
      usage: '/feature-dev [tên tính năng]',
      execute: async (args: string) => {
        return `[FEATURE-DEV] Bắt đầu phát triển: ${args || 'unnamed feature'}\nPhase 1/7: Discovery...`;
      },
    },
    {
      name: 'Deploy Check',
      description: 'Kiểm tra trạng thái sẵn sàng deploy',
      trigger: '/deploy-check',
      usage: '/deploy-check',
      execute: async () => {
        return '[DEPLOY-CHECK] Đang kiểm tra: uncommitted changes, tests, build, env vars...';
      },
    },
  ];
}
