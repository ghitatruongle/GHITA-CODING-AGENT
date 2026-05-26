// ==============================================================================
// GHITA CODING AGENT - Shared Constants
// ==============================================================================

import type { AIProviderType, SkillCategory } from './types.js';

// --- App Info ---
export const APP_NAME = 'GHITA CODING AGENT';
export const APP_VERSION = '0.1.0';
export const APP_DESCRIPTION = 'Desktop AI Agent với multi-provider, skills, computer use';

// --- Default Config ---
export const DEFAULT_SOCKET_PORT = 8080;
export const DEFAULT_LANGUAGE = 'vi';
export const DEFAULT_THEME = 'dark' as const;
export const DEFAULT_LOG_LEVEL = 'info' as const;
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0.7;

// --- AI Providers ---
export const AI_PROVIDERS: Record<AIProviderType, { name: string; defaultModel: string }> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o' },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514' },
  google: { name: 'Google', defaultModel: 'gemini-1.5-pro' },
  ollama: { name: 'Ollama (Local)', defaultModel: 'llama3' },
  custom: { name: 'Custom', defaultModel: '' },
  opengateway: { name: 'Gitlawb Opengateway', defaultModel: 'mimo-v2.5-pro' },
  mimo: { name: 'Xiaomi MiMo', defaultModel: 'mimo-v2.5-pro' },
  openrouter: { name: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-4' },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  groq: { name: 'Groq', defaultModel: 'llama-3.1-70b-versatile' },
  mistral: { name: 'Mistral', defaultModel: 'mistral-large-latest' },
  hicap: { name: 'Hicap', defaultModel: '' },
  'github-models': { name: 'GitHub Models', defaultModel: 'gpt-4o' },
  // Phase 1.2: New providers
  cerebras: { name: 'Cerebras', defaultModel: 'llama3.1-8b' },
  together: { name: 'Together AI', defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' },
  fireworks: { name: 'Fireworks AI', defaultModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct' },
  cohere: { name: 'Cohere', defaultModel: 'command-r-plus' },
  xai: { name: 'xAI (Grok)', defaultModel: 'grok-beta' },
  replicate: { name: 'Replicate', defaultModel: 'meta/llama-3.1-8b-instruct' },
  perplexity: { name: 'Perplexity', defaultModel: 'llama-3.1-sonar-small-128k-online' },
  voyage: { name: 'Voyage AI', defaultModel: 'voyage-3' },
  ai21: { name: 'AI21 Labs', defaultModel: 'jamba-1.5-large' },
  sambanova: { name: 'SambaNova', defaultModel: 'Meta-Llama-3.1-8B-Instruct' },
  novita: { name: 'Novita AI', defaultModel: 'meta-llama/llama-3.1-8b-instruct' },
};

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

// --- Skill Categories ---
export const SKILL_CATEGORIES: Record<SkillCategory, { name: string; icon: string }> = {
  file: { name: 'File Manager', icon: '📁' },
  terminal: { name: 'Terminal', icon: '💻' },
  browser: { name: 'Browser Control', icon: '🌐' },
  computer: { name: 'Computer Use', icon: '🖥️' },
  screenshot: { name: 'Screenshot', icon: '📸' },
  app: { name: 'App Control', icon: '⚙️' },
};

// --- Agent Roles ---
export const AGENT_ROLES = {
  coder: { name: 'Coder', description: 'Viết và sửa code' },
  reviewer: { name: 'Reviewer', description: 'Review code quality' },
  researcher: { name: 'Researcher', description: 'Tìm kiếm thông tin' },
  planner: { name: 'Planner', description: 'Lập kế hoạch task' },
  executor: { name: 'Executor', description: 'Thực thi task' },
  custom: { name: 'Custom', description: 'Tùy chỉnh' },
} as const;

// --- Socket Events ---
export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  PAIR: 'pair',
  PAIR_CONFIRM: 'pair_confirm',
  COMMAND: 'command',
  SCREENSHOT: 'screenshot',
  STATUS: 'status',
  APPROVE: 'approve',
  REJECT: 'reject',
  CHAT: 'chat',
  SCREEN_STREAM: 'screen_stream',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  // --- Phase 8 Events ---
  REQUIRE_APPROVAL: 'require_approval',
  APPROVE_COMMAND: 'approve_command',
  REJECT_COMMAND: 'reject_command',
  COST_TELEMETRY: 'cost_telemetry',
  SYNC_LANGUAGE: 'sync_language',
} as const;

// --- Screen Stream Defaults ---
export const DEFAULT_SCREEN_QUALITY = 60;
export const DEFAULT_STREAM_INTERVAL = 1000;
export const DEFAULT_STREAM_MAX_WIDTH = 1280;
export const DEFAULT_PAIRING_TTL = 300_000; // 5 minutes

// --- File Extensions ---
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go',
  '.java', '.cpp', '.c', '.h', '.css', '.html', '.json',
  '.yaml', '.yml', '.toml', '.md', '.sql', '.sh',
] as const;

// --- Paths ---
export const CONFIG_DIR_NAME = '.ghita';
export const LOG_DIR_NAME = 'logs';
export const MEMORY_DIR_NAME = 'memory';
