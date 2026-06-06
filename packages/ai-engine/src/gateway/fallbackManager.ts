// =============================================================================
// GHITA CODING AGENT - Phase 16: API Cost Tracker & Usage Failover Manager
// Quản lý định tuyến dự phòng, đếm token offline và thống kê chi phí SQLite.
// =============================================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';

export interface BudgetConfig {
  maxCostPerSession: number;
  maxCostPerDay: number;
  alertThresholdPercent: number;
}

export interface CostRecord {
  id: string;
  sessionId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  success: number;
  errorMessage?: string;
  timestamp: Date;
}

// Bảng giá API (USD per 1,000 tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-sonnet-latest': { input: 0.003, output: 0.015 },
  'claude-3-7-sonnet': { input: 0.003, output: 0.015 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.00375 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.00375 },
  'gemini-2.5-flash': { input: 0.000075, output: 0.0003 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.00219 },
  'deepseek-r1': { input: 0.00055, output: 0.00219 },
  ollama: { input: 0.0, output: 0.0 },
};

export class FallbackManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  private sessionId: string;
  private budgetConfig!: BudgetConfig;
  private budgetConfigPath: string;
  private fallbackChain: string[] = [
    'claude-3-7-sonnet',
    'deepseek-r1',
    'gemini-2.5-pro',
    'ollama',
  ];

  // Biến lưu tiktoken encoder nếu được load động thành công
  private tiktokenEncoder: {
    encode: (text: string) => ArrayLike<number>;
    free?: () => void;
  } | null = null;

  // Model specific timeouts configuration in milliseconds (STT 16 Optimization)
  private modelTimeouts: Record<string, number> = {
    'gpt-4o-mini': 3000,
    'gemini-2.5-flash': 3000,
    'gemini-1.5-flash': 3000,
    'deepseek-chat': 5000,
    'claude-3-5-sonnet-latest': 10000,
    'claude-3-7-sonnet': 10000,
    'deepseek-r1': 15000,
  };

  // Health and Circuit Breaker Registry
  private consecutiveModelFailures = new Map<string, number>();
  private modelUnhealthyUntil = new Map<string, number>();

  constructor(
    options: {
      dbPath?: string;
      sessionId?: string;
      budgetConfigPath?: string;
      fallbackChain?: string[];
    } = {},
  ) {
    this.dbPath = options.dbPath || ':memory:';
    this.sessionId = options.sessionId || `session-${Date.now()}`;
    this.budgetConfigPath =
      options.budgetConfigPath || path.resolve(process.cwd(), '.ghita', 'budget.yaml');
    if (options.fallbackChain) {
      this.fallbackChain = options.fallbackChain;
    }

    this.initDatabase();
    this.loadBudgetConfig();
    this.initTiktoken();
  }

  // =========================================================================
  // SQLite Database Initialization
  // =========================================================================
  private initDatabase(): void {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cost_logs (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL,
          completion_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          cost REAL NOT NULL,
          success INTEGER NOT NULL,
          error_message TEXT,
          timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cost_logs_session ON cost_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_cost_logs_timestamp ON cost_logs(timestamp);
      `);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Failover] SQLite failed to initialize: ${message}. Running with in-memory SQLite.`,
      );
      this.db = new Database(':memory:');
    }
  }

  // =========================================================================
  // Budget Configuration Loader
  // =========================================================================
  public loadBudgetConfig(): void {
    const defaultBudget: BudgetConfig = {
      maxCostPerSession: 5.0, // $5.0 USD
      maxCostPerDay: 20.0, // $20.0 USD
      alertThresholdPercent: 50.0, // 50%
    };

    try {
      if (fs.existsSync(this.budgetConfigPath)) {
        const content = fs.readFileSync(this.budgetConfigPath, 'utf-8');
        const parsed = this.parseSimpleYaml(content);
        this.budgetConfig = {
          maxCostPerSession: parsed.max_cost_per_session ?? defaultBudget.maxCostPerSession,
          maxCostPerDay: parsed.max_cost_per_day ?? defaultBudget.maxCostPerDay,
          alertThresholdPercent:
            parsed.alert_threshold_percent ?? defaultBudget.alertThresholdPercent,
        };
      } else {
        this.budgetConfig = defaultBudget;
        // Tự sinh file budget.yaml mẫu nếu chưa có
        this.writeDefaultBudgetFile();
      }
    } catch {
      this.budgetConfig = defaultBudget;
    }
  }

  private parseSimpleYaml(content: string): Record<string, number> {
    const result: Record<string, number> = {};
    const lines = content.split(/\r?\n/);
    let inBudget = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('budget:')) {
        inBudget = true;
        continue;
      }

      if (inBudget) {
        if (trimmed.includes(':')) {
          const [k, ...v] = trimmed.split(':');
          const key = (k ?? '').trim();
          const val = v.join(':').trim();
          result[key] = Number(val);
        }
      }
    }
    return result;
  }

  private writeDefaultBudgetFile(): void {
    try {
      const dir = path.dirname(this.budgetConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const yamlContent = `# Cấu hình giới hạn ngân sách API cho GHITA
budget:
  max_cost_per_session: 5.0
  max_cost_per_day: 20.0
  alert_threshold_percent: 50.0
`;
      fs.writeFileSync(this.budgetConfigPath, yamlContent, 'utf-8');
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // Tiktoken Encoder Initialization
  // =========================================================================
  private async initTiktoken(): Promise<void> {
    try {
      // Hỗ trợ dynamic import cho tiktoken nếu có
      const { get_encoding } = await import('@dqbd/tiktoken' as string);
      this.tiktokenEncoder = get_encoding('cl100k_base');
    } catch {
      try {
        const { encodingForModel } = await import('js-tiktoken' as string);
        this.tiktokenEncoder = encodingForModel('gpt-4o');
      } catch {
        // Fallback về custom character length tokenizer offline bên dưới
        this.tiktokenEncoder = null;
      }
    }
  }

  /**
   * Đếm số lượng token offline tốc độ cao
   */
  public countTokens(text: string): number {
    if (this.tiktokenEncoder) {
      try {
        return this.tiktokenEncoder.encode(text).length;
      } catch {
        // ignore and fallback
      }
    }

    // High quality offline fallback tokenizer
    if (!text) return 0;

    // Ratios for estimation: English ~ 4 chars/token, CJK/Vietnamese ~ 1.5 chars/token
    let tokens = 0;
    const words = text.split(/\s+/);
    for (const word of words) {
      if (!word) continue;
      // Nhận dạng ký tự đặc biệt / tiếng Việt / Code
      const hasUnicode = Array.from(word).some((char) => (char.codePointAt(0) ?? 0) > 127);
      if (hasUnicode) {
        tokens += Math.ceil(word.length / 1.5);
      } else {
        tokens += Math.ceil(word.length / 4.0) + 1; // +1 space
      }
    }
    return Math.max(1, tokens);
  }

  /**
   * Đếm token cho danh sách ChatMessage
   */
  public countMessagesTokens(messages: ChatMessage[]): number {
    let count = 0;
    for (const msg of messages) {
      count += this.countTokens(msg.content);
      count += 4; // metadata overhead
    }
    return count + 3; // system instructions overhead
  }

  // =========================================================================
  // Cost Calculation
  // =========================================================================
  public calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    // Lấy pricing theo model name gần nhất (loại bỏ provider prefix)
    const modelKey = model.split('/').pop()?.toLowerCase() || '';
    const pricing = MODEL_PRICING[modelKey] ?? MODEL_PRICING['ollama'];
    if (!pricing) return 0;

    const inputCost = (promptTokens / 1000) * (pricing?.input ?? 0);
    const outputCost = (completionTokens / 1000) * (pricing?.output ?? 0);
    return inputCost + outputCost;
  }

  // =========================================================================
  // SQLite Cost Logging
  // =========================================================================
  public logCost(record: Omit<CostRecord, 'id' | 'timestamp'>): void {
    if (!this.db) return;

    const id = `cost-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO cost_logs (id, session_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost, success, error_message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        record.sessionId,
        record.provider,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        record.cost,
        record.success,
        record.errorMessage || null,
        timestamp,
      );

      // Kiểm tra ngưỡng cảnh báo để thông báo
      this.checkBudgetAlerts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Failover] Failed to write cost log: ${message}`);
    }
  }

  // =========================================================================
  // Budget & Alert Checks
  // =========================================================================
  public getSessionTotalCost(): number {
    if (!this.db) return 0;
    const row = this.db
      .prepare('SELECT SUM(cost) as total FROM cost_logs WHERE session_id = ? AND success = 1')
      .get(this.sessionId) as { total: number | null } | undefined;
    return row?.total ?? 0;
  }

  public getDayTotalCost(): number {
    if (!this.db) return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    if (!todayStr) return 0;
    const row = this.db
      .prepare('SELECT SUM(cost) as total FROM cost_logs WHERE timestamp LIKE ? AND success = 1')
      .get(`${todayStr}%`) as { total: number | null } | undefined;
    return row?.total ?? 0;
  }

  private checkBudgetAlerts(): void {
    const sessionCost = this.getSessionTotalCost();
    const dayCost = this.getDayTotalCost();

    const sessionLimit = this.budgetConfig.maxCostPerSession;
    const dayLimit = this.budgetConfig.maxCostPerDay;
    const alertPercent = this.budgetConfig.alertThresholdPercent / 100;

    // Bắn cảnh báo giả lập nếu vượt ngưỡng alert
    if (sessionCost > sessionLimit * alertPercent) {
      const alertMsg = `⚠️ ALERT: Session cost $${sessionCost.toFixed(4)} has exceeded ${this.budgetConfig.alertThresholdPercent}% of limit ($${sessionLimit.toFixed(2)})!`;
      console.warn(alertMsg);
      this.triggerOltNotification(alertMsg);
    }

    if (dayCost > dayLimit * alertPercent) {
      const alertMsg = `⚠️ ALERT: Daily cost $${dayCost.toFixed(4)} has exceeded ${this.budgetConfig.alertThresholdPercent}% of limit ($${dayLimit.toFixed(2)})!`;
      console.warn(alertMsg);
      this.triggerOltNotification(alertMsg);
    }
  }

  private triggerOltNotification(message: string): void {
    // Giả lập trigger OLT WebSocket/Feishu notification
    // Trong thực tế sẽ gửi tới WebSocket server/Zalo/Feishu webhook
    const event = new CustomEvent('ghita-olt-notification', {
      detail: { message, timestamp: new Date() },
    });
    if (typeof globalThis !== 'undefined' && globalThis.dispatchEvent) {
      globalThis.dispatchEvent(event);
    }
  }

  // =========================================================================
  // API Call execution with Fallback Manager
  // =========================================================================
  public async executeWithFailover(
    callFn: (model: string) => Promise<ChatResponse>,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // 1. Kiểm duyệt Budget trước khi gọi API
    const currentSessionCost = this.getSessionTotalCost();
    if (currentSessionCost >= this.budgetConfig.maxCostPerSession) {
      throw new Error(
        `[BudgetExceeded] Session cost limit ($${this.budgetConfig.maxCostPerSession}) reached. Current: $${currentSessionCost.toFixed(4)}`,
      );
    }

    const currentDayCost = this.getDayTotalCost();
    if (currentDayCost >= this.budgetConfig.maxCostPerDay) {
      throw new Error(
        `[BudgetExceeded] Daily cost limit ($${this.budgetConfig.maxCostPerDay}) reached. Current: $${currentDayCost.toFixed(4)}`,
      );
    }

    // 2. Thiết lập chuỗi fallback models
    const requestedModel = options?.model;
    const chain = requestedModel
      ? [requestedModel, ...this.fallbackChain.filter((m) => m !== requestedModel)]
      : this.fallbackChain;

    // Filter chain based on Circuit Breaker health status
    const now = Date.now();
    const healthyChain = chain.filter((model) => {
      const unhealthyUntil = this.modelUnhealthyUntil.get(model) || 0;
      return unhealthyUntil <= now;
    });
    const activeChain = healthyChain.length > 0 ? healthyChain : chain;

    const promptTokens = this.countMessagesTokens(messages);
    let _lastError: Error | null = null;

    // 3. Vòng lặp Failover
    for (let idx = 0; idx < activeChain.length; idx++) {
      const model = activeChain[idx];
      if (!model) continue;
      const timeoutMs = this.modelTimeouts[model] || 15000;

      let timer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`[Timeout] API call to model ${model} exceeded limit of ${timeoutMs}ms`),
          );
        }, timeoutMs);
      });

      try {
        // Thực thi gọi API với cơ chế Timeout Race
        const response = await Promise.race([callFn(model), timeoutPromise]);
        if (timer) clearTimeout(timer);

        // Thành công: Reset số lần lỗi liên tiếp và sức khỏe của model
        this.consecutiveModelFailures.set(model, 0);
        this.modelUnhealthyUntil.delete(model);

        // 4. Ước tính/Nhận token chính xác từ kết quả
        const responsePromptTokens = response.usage?.promptTokens ?? promptTokens;
        const responseCompletionTokens =
          response.usage?.completionTokens ?? this.countTokens(response.content);
        const responseTotalTokens =
          response.usage?.totalTokens ?? responsePromptTokens + responseCompletionTokens;

        const cost = this.calculateCost(model, responsePromptTokens, responseCompletionTokens);

        // Ghi log SQLite thành công
        this.logCost({
          sessionId: this.sessionId,
          provider: options?.agentRole || 'unknown-provider',
          model,
          promptTokens: responsePromptTokens,
          completionTokens: responseCompletionTokens,
          totalTokens: responseTotalTokens,
          cost,
          success: 1,
        });

        return response;
      } catch (err: unknown) {
        if (timer) clearTimeout(timer);
        _lastError = err instanceof Error ? err : new Error(String(err));

        // Ghi nhận lỗi cho Circuit Breaker
        const currentFailures = (this.consecutiveModelFailures.get(model) || 0) + 1;
        this.consecutiveModelFailures.set(model, currentFailures);
        if (currentFailures >= 3) {
          // Trip breaker: tạm ngưng 60s
          this.modelUnhealthyUntil.set(model, Date.now() + 60000);
          console.warn(
            `[CircuitBreaker] Model ${model} has failed ${currentFailures} times consecutively. Marking as unhealthy for 60s.`,
          );
        }

        // Log SQLite thất bại
        this.logCost({
          sessionId: this.sessionId,
          provider: options?.agentRole || 'unknown-provider',
          model,
          promptTokens,
          completionTokens: 0,
          totalTokens: promptTokens,
          cost: 0,
          success: 0,
          errorMessage: _lastError.message,
        });

        // Dynamic Backoff/Failover delay:
        // - Rate-limited (429): Chờ lâu hơn để hồi phục (500ms)
        // - Transient (500/502/503/504) hoặc Timeout: Chuyển đổi nhanh chóng (100ms)
        const isRateLimit =
          _lastError.message?.includes('429') || _lastError.message?.includes('rate limit');
        const delayMs = isRateLimit ? 500 : 100;

        if (idx < activeChain.length - 1) {
          const warnMsg = `🔴 FAILOVER: Model ${model} failed. Error: ${_lastError.message}. Switching fallback in ${delayMs}ms...`;
          console.error(warnMsg);
          this.triggerOltNotification(warnMsg);
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          const warnMsg = `🔴 FAILOVER: Model ${model} failed. Error: ${_lastError.message}. No more models in primary chain.`;
          console.error(warnMsg);
          this.triggerOltNotification(warnMsg);
        }
      }
    }

    // Nếu toàn bộ chain bị lỗi -> kích hoạt Local Fallback Ollama cuối cùng
    try {
      const localModel = 'ollama/qwen2.5-coder:1.5b';
      const warnMsg = `🚨 EMERGENCY: Cloud providers exhausted. Falling back to local Ollama!`;
      console.warn(warnMsg);
      this.triggerOltNotification(warnMsg);

      const response = await callFn(localModel);

      const responsePromptTokens = response.usage?.promptTokens ?? promptTokens;
      const responseCompletionTokens =
        response.usage?.completionTokens ?? this.countTokens(response.content);

      this.logCost({
        sessionId: this.sessionId,
        provider: options?.agentRole || 'ollama-fallback',
        model: localModel,
        promptTokens: responsePromptTokens,
        completionTokens: responseCompletionTokens,
        totalTokens: responsePromptTokens + responseCompletionTokens,
        cost: 0, // Ollama is free
        success: 1,
      });

      return response;
    } catch (localErr: unknown) {
      const localMessage = localErr instanceof Error ? localErr.message : String(localErr);
      throw new Error(
        `All remote providers and local Ollama fallback failed. Last error: ${localMessage}. Primary chain error: ${_lastError?.message || 'none'}`,
      );
    }
  }

  /**
   * Đóng database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.tiktokenEncoder?.free) {
      this.tiktokenEncoder.free();
    }
  }
}
