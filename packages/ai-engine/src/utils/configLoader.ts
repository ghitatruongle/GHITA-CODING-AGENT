import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderConfig } from '../types.js';

export interface LocalConfig {
  agentModels: {
    [key: string]: {
      type: string;
      base_url?: string;
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
  mcpServers?: {
    [name: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
    };
  };
}

export class ConfigLoader {
  private configPath: string;

  constructor() {
    // Use GHITA_DATA_DIR (set by Tauri backend) for secure storage, fallback to home dir
    const dataDir = process.env.GHITA_DATA_DIR || os.homedir();
    this.configPath = path.resolve(dataDir, '.ghita-coding-agent.json');
  }

  /**
   * Đọc cấu hình từ file agent config
   */
  load(): LocalConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.initializeDefaultConfig();
      }
      const data = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(data) as LocalConfig;

      // Validate required fields exist (file may be from another tool like OpenClaude CLI)
      if (
        !parsed.agentModels ||
        typeof parsed.agentModels !== 'object' ||
        !parsed.agentRouting ||
        typeof parsed.agentRouting !== 'object'
      ) {
        console.warn('Config file missing agentModels/agentRouting, using defaults');
        return this.initializeDefaultConfig();
      }

      // Strip api_key if present (legacy migration — API keys are stored separately in api-config.json)
      for (const entry of Object.values(parsed.agentModels)) {
        delete (entry as Record<string, unknown>).api_key;
      }

      return parsed;
    } catch (error) {
      console.error('Failed to load local settings, loading defaults:', error);
      return this.initializeDefaultConfig();
    }
  }

  /**
   * Lưu cấu hình mới xuống file agent config
   */
  save(config: LocalConfig): void {
    try {
      // Ensure api_key is never persisted (security: API keys stored in api-config.json)
      for (const entry of Object.values(config.agentModels)) {
        delete (entry as Record<string, unknown>).api_key;
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.info(`Local configuration saved to ${this.configPath}`);
    } catch (error) {
      console.error('Failed to save local settings:', error);
    }
  }

  /**
   * Chuyển đổi LocalConfig sang mảng ProviderConfig của AI Engine
   * Note: apiKey is left empty — actual keys are synced from api-config.json by syncApiConfigToOrchestrator()
   */
  toProviderConfigs(localConfig: LocalConfig): ProviderConfig[] {
    const configs: ProviderConfig[] = [];
    if (!localConfig.agentModels) return configs;
    for (const [name, meta] of Object.entries(localConfig.agentModels)) {
      configs.push({
        type: meta.type as ProviderConfig['type'],
        apiKey: '',
        baseUrl: meta.base_url,
        defaultModel: meta.default_model || name,
      });
    }
    return configs;
  }

  /**
   * Lấy danh sách MCP servers từ config
   */
  getMCPServers(localConfig: LocalConfig): Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    enabled: boolean;
  }> {
    if (!localConfig.mcpServers) return [];
    return Object.entries(localConfig.mcpServers)
      .filter(([, server]) => server.enabled !== false)
      .map(([name, server]) => ({
        name,
        command: server.command,
        args: server.args,
        env: server.env,
        enabled: server.enabled ?? true,
      }));
  }

  private initializeDefaultConfig(): LocalConfig {
    const defaultConfig: LocalConfig = {
      agentModels: {
        'openai-gpt-4o': {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          default_model: 'gpt-4o',
        },
        'anthropic-sonnet': {
          type: 'anthropic',
          base_url: 'https://api.anthropic.com/v1',
          default_model: 'claude-3-5-sonnet-latest',
        },
        'ollama-llama3': {
          type: 'ollama',
          base_url: 'http://localhost:11434',
          default_model: 'llama3',
        },
        'opengateway-mimo': {
          type: 'opengateway',
          base_url: 'https://opengateway.gitlawb.com/v1',
          default_model: 'mimo-v2.5-pro',
        },
        'deepseek-chat': {
          type: 'deepseek',
          base_url: 'https://api.deepseek.com/v1',
          default_model: 'deepseek-chat',
        },
        'groq-llama': {
          type: 'groq',
          base_url: 'https://api.groq.com/openai/v1',
          default_model: 'llama-3.1-70b-versatile',
        },
      },
      agentRouting: {
        Explore: 'ollama-llama3',
        Plan: 'anthropic-sonnet',
        UI: 'openai-gpt-4o',
        default: 'opengateway-mimo',
      },
      mcpServers: {},
    };

    this.save(defaultConfig);
    return defaultConfig;
  }
}
