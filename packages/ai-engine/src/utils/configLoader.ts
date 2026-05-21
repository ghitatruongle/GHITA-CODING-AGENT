import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderConfig } from '../types.js';

export interface LocalConfig {
  agentModels: {
    [key: string]: {
      type: string;
      base_url?: string;
      api_key?: string;
      default_model?: string;
    };
  };
  agentRouting: {
    Explore: string;
    Plan: string;
    UI: string;
    default: string;
    [key: string]: string;
  };
}

export class ConfigLoader {
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(os.homedir(), '.ghita-coding-agent.json');
  }

  /**
   * Đọc cấu hình từ file ~/.openclaude.json
   */
  load(): LocalConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.initializeDefaultConfig();
      }
      const data = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(data) as LocalConfig;

      // Validate required fields exist (file may be from another tool like OpenClaude CLI)
      if (!parsed.agentModels || typeof parsed.agentModels !== 'object' ||
          !parsed.agentRouting || typeof parsed.agentRouting !== 'object') {
        console.warn('Config file missing agentModels/agentRouting, using defaults');
        return this.initializeDefaultConfig();
      }

      return parsed;
    } catch (error) {
      console.error('Failed to load local settings, loading defaults:', error);
      return this.initializeDefaultConfig();
    }
  }

  /**
   * Lưu cấu hình mới xuống file ~/.openclaude.json
   */
  save(config: LocalConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`Local configuration saved to ${this.configPath}`);
    } catch (error) {
      console.error('Failed to save local settings:', error);
    }
  }

  /**
   * Chuyển đổi LocalConfig sang mảng ProviderConfig của AI Engine
   */
  toProviderConfigs(localConfig: LocalConfig): ProviderConfig[] {
    const configs: ProviderConfig[] = [];
    if (!localConfig.agentModels) return configs;
    for (const [name, meta] of Object.entries(localConfig.agentModels)) {
      configs.push({
        type: meta.type as any,
        apiKey: meta.api_key,
        baseUrl: meta.base_url,
        defaultModel: meta.default_model || name,
      });
    }
    return configs;
  }

  private initializeDefaultConfig(): LocalConfig {
    const defaultConfig: LocalConfig = {
      agentModels: {
        'openai-gpt-4o': {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: '',
          default_model: 'gpt-4o',
        },
        'anthropic-sonnet': {
          type: 'anthropic',
          base_url: 'https://api.anthropic.com/v1',
          api_key: '',
          default_model: 'claude-3-5-sonnet-latest',
        },
        'ollama-llama3': {
          type: 'ollama',
          base_url: 'http://localhost:11434',
          api_key: '',
          default_model: 'llama3',
        },
        'opengateway-mimo': {
          type: 'opengateway',
          base_url: 'https://opengateway.gitlawb.com/v1',
          api_key: '',
          default_model: 'mimo-v2.5-pro',
        },
        'deepseek-chat': {
          type: 'deepseek',
          base_url: 'https://api.deepseek.com/v1',
          api_key: '',
          default_model: 'deepseek-chat',
        },
        'groq-llama': {
          type: 'groq',
          base_url: 'https://api.groq.com/openai/v1',
          api_key: '',
          default_model: 'llama-3.1-70b-versatile',
        },
      },
      agentRouting: {
        Explore: 'ollama-llama3',
        Plan: 'anthropic-sonnet',
        UI: 'openai-gpt-4o',
        default: 'opengateway-mimo',
      },
    };

    this.save(defaultConfig);
    return defaultConfig;
  }
}
