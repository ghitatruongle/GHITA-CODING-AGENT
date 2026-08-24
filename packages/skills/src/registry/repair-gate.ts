import { AIToolCallRepairError } from '@ghita/ai-engine';

export interface RepairLLMProvider {
  
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
          
          currentArgs = await this.llmProvider.fixArguments(
            toolName,
            schema,
            currentArgs,
            errorMessage,
          );
        } catch (repairError) {
          
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
