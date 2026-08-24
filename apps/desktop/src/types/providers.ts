// Single source of truth for ProviderId and PROVIDER_LABELS.

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'custom'
  | 'opengateway'
  | 'mimo'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'hicap'
  | 'github-models'
  // Phase 1.2: New providers
  | 'cerebras'
  | 'together'
  | 'fireworks'
  | 'cohere'
  | 'xai'
  | 'replicate'
  | 'perplexity'
  | 'voyage'
  | 'ai21'
  | 'sambanova'
  | 'novita'
  | 'opencode-zen'
  | 'nvidia-nim';

export const PROVIDER_LABELS: Record<ProviderId, { name: string; icon: string }> = {
  openai: { name: 'OpenAI', icon: '🟢' },
  anthropic: { name: 'Anthropic', icon: '🟣' },
  google: { name: 'Google Gemini', icon: '🔵' },
  ollama: { name: 'Ollama (Local)', icon: '🦙' },
  custom: { name: 'Custom Provider', icon: '⚙️' },
  opengateway: { name: 'Gitlawb Opengateway', icon: '🌐' },
  mimo: { name: 'Xiaomi MiMo', icon: '🤖' },
  openrouter: { name: 'OpenRouter', icon: '🔀' },
  deepseek: { name: 'DeepSeek', icon: '🔍' },
  groq: { name: 'Groq', icon: '⚡' },
  mistral: { name: 'Mistral', icon: '🌊' },
  hicap: { name: 'Hicap', icon: '🔗' },
  'github-models': { name: 'GitHub Models', icon: '🐙' },
  cerebras: { name: 'Cerebras', icon: '⚡' },
  together: { name: 'Together AI', icon: '🤝' },
  fireworks: { name: 'Fireworks AI', icon: '🎆' },
  cohere: { name: 'Cohere', icon: '🔷' },
  xai: { name: 'xAI (Grok)', icon: '❌' },
  replicate: { name: 'Replicate', icon: '🔁' },
  perplexity: { name: 'Perplexity', icon: '🔎' },
  voyage: { name: 'Voyage AI', icon: '🧭' },
  ai21: { name: 'AI21 Labs', icon: '🧪' },
  sambanova: { name: 'SambaNova', icon: '🔥' },
  novita: { name: 'Novita AI', icon: '🌟' },
  'opencode-zen': { name: 'OpenCode Zen', icon: '🧘' },
  'nvidia-nim': { name: 'NVIDIA NIM', icon: '🟢' },
};
