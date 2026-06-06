// ==============================================================================
// GHITA CODING AGENT - Tool Auto-Repair Gate
// ==============================================================================

import { AIToolCallRepairError } from '@ghita/ai-engine';

export interface RepairLLMProvider {
  /** Hàm sinh ra đoạn JSON fix tham số dựa vào lỗi */
  fixArguments(
    toolName: string,
    schema: Record<string, unknown>,
    badArgs: unknown,
    errorMessage: string,
  ): Promise<Record<string, unknown>>;
}

export interface ToolRepairOptions {
  maxRetries?: number;
  llmProvider: RepairLLMProvider;
}

export class ToolRepairGate {
  private maxRetries: number;
  private llmProvider: RepairLLMProvider;

  constructor(options: ToolRepairOptions) {
    this.maxRetries = options.maxRetries ?? 3;
    this.llmProvider = options.llmProvider;
  }

  /**
   * Bọc một lệnh thực thi tool và tự động sửa args nếu bị lỗi validation.
   */
  async executeWithRepair<TResult>(
    toolName: string,
    schema: Record<string, unknown>,
    initialArgs: Record<string, unknown>,
    executor: (args: Record<string, unknown>) => Promise<TResult>,
  ): Promise<TResult> {
    let currentArgs = initialArgs;
    let attempts = 0;
    const toolErrors: unknown[] = [];

    while (attempts <= this.maxRetries) {
      try {
        const result = await executor(currentArgs);
        return result;
      } catch (error) {
        toolErrors.push(error);
        attempts++;

        if (attempts > this.maxRetries) {
          throw new AIToolCallRepairError(
            JSON.stringify(currentArgs),
            attempts - 1,
            toolErrors,
            `Failed to execute tool "${toolName}" and exhausted repair attempts`,
          );
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        try {
          // Gửi LLM để fix
          currentArgs = await this.llmProvider.fixArguments(
            toolName,
            schema,
            currentArgs,
            errorMessage,
          );
        } catch (repairError) {
          // Nếu việc gọi LLM để sửa cũng lỗi, gộp chung và văng ra luôn
          toolErrors.push(repairError);
          throw new AIToolCallRepairError(
            JSON.stringify(currentArgs),
            attempts,
            toolErrors,
            `Failed during LLM repair of tool "${toolName}"`,
          );
        }
      }
    }

    throw new Error('Unreachable code in ToolRepairGate');
  }
}
