import type { ChatMessage, TokenUsage } from '../types.js';
import type { Orchestrator } from '../orchestrator.js';

export interface RalphLoopConfig {
  maxIterations: number;
  costLimitUsd: number;
  compileCommand?: string;
  testCommand?: string;
}

export interface RalphLoopState {
  currentIteration: number;
  totalTokensUsed: TokenUsage;
  totalCostUsd: number;
  success: boolean;
  history: ChatMessage[];
  errorLogs?: string;
}

export class RalphLoopManager {
  private orchestrator: Orchestrator;
  private config: RalphLoopConfig;

  private readonly PRICE_PER_1K_INPUT = 0.003; // $0.003 / 1k input tokens
  private readonly PRICE_PER_1K_OUTPUT = 0.015; // $0.015 / 1k output tokens

  constructor(orchestrator: Orchestrator, config?: Partial<RalphLoopConfig>) {
    this.orchestrator = orchestrator;
    this.config = {
      maxIterations: config?.maxIterations ?? 5,
      costLimitUsd: config?.costLimitUsd ?? 0.5, // Mặc định giới hạn $0.50 để an toàn tài chính
      compileCommand: config?.compileCommand,
      testCommand: config?.testCommand,
    };
  }

  calculateCost(usage: TokenUsage): number {
    const inputCost = (usage.promptTokens / 1000) * this.PRICE_PER_1K_INPUT;
    const outputCost = (usage.completionTokens / 1000) * this.PRICE_PER_1K_OUTPUT;
    return inputCost + outputCost;
  }

  async run(
    task: string,
    executeAction: (code: string) => Promise<{ success: boolean; logs: string }>,
    onProgress: (status: {
      iteration: number;
      cost: number;
      message: string;
      code?: string;
    }) => void,
  ): Promise<RalphLoopState> {
    let currentIteration = 0;
    let totalCostUsd = 0;
    const totalTokensUsed: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let success = false;
    let errorLogs = '';

    const history: ChatMessage[] = [
      {
        role: 'system',
        content: `Bạn là trợ lý tự sửa sai thông minh nằm trong vòng lặp Ralph Loop của GHITA.
Nhiệm vụ của bạn là hoàn thành code cho yêu cầu của người dùng.
Khi bạn viết code, hãy đặt toàn bộ file code hoàn chỉnh duy nhất trong thẻ Markdown block code \`\`\`tsx hoặc \`\`\`typescript để hệ thống trích xuất.
Nếu hệ thống báo lỗi biên dịch, bạn phải phân tích kỹ stacktrace lỗi và tự động sửa sai để nộp lại bản code hoàn chỉnh tiếp theo.`,
      },
      {
        role: 'user',
        content: `Hãy viết code hoàn thành tác vụ sau: ${task}`,
      },
    ];

    while (currentIteration < this.config.maxIterations) {
      currentIteration++;

      if (totalCostUsd >= this.config.costLimitUsd) {
        onProgress({
          iteration: currentIteration,
          cost: totalCostUsd,
          message: `🛑 Chạm giới hạn chi phí tối đa ($${this.config.costLimitUsd.toFixed(4)} USD). Dừng vòng lặp để đảm bảo an toàn tài chính.`,
        });
        break;
      }

      onProgress({
        iteration: currentIteration,
        cost: totalCostUsd,
        message: `🤖 Vòng lặp ${currentIteration}/${this.config.maxIterations}: AI đang suy nghĩ giải pháp...`,
      });

      const chatResponse = await this.orchestrator.chat(history, { agentRole: 'Plan' });

      totalTokensUsed.promptTokens += chatResponse.usage.promptTokens;
      totalTokensUsed.completionTokens += chatResponse.usage.completionTokens;
      totalTokensUsed.totalTokens += chatResponse.usage.totalTokens;
      const stepCost = this.calculateCost(chatResponse.usage);
      totalCostUsd += stepCost;

      const aiContent = chatResponse.content;
      history.push({ role: 'assistant', content: aiContent });

      const codeMatch = aiContent.match(
        /```(?:tsx|typescript|javascript|js|html|css)?\s*([\s\S]*?)```/,
      );
      const code = codeMatch ? codeMatch[1]?.trim() : aiContent;

      if (!code) {
        onProgress({
          iteration: currentIteration,
          cost: totalCostUsd,
          message: `⚠️ Không tìm thấy code được định dạng trong câu trả lời. Thử lại...`,
        });
        history.push({
          role: 'user',
          content:
            'Không tìm thấy code hợp lệ trong định dạng thẻ block code. Vui lòng viết lại mã nguồn nằm trong thẻ ``` ```.',
        });
        continue;
      }

      onProgress({
        iteration: currentIteration,
        cost: totalCostUsd,
        message: `⚙️ Vòng lặp ${currentIteration}/${this.config.maxIterations}: Đang biên dịch và kiểm thử code sinh ra...`,
        code: code,
      });

      const executionResult = await executeAction(code);

      if (executionResult.success) {
        success = true;
        errorLogs = executionResult.logs;
        onProgress({
          iteration: currentIteration,
          cost: totalCostUsd,
          message: `✨ Biên dịch và kiểm thử THÀNH CÔNG 100%! Vòng lặp Ralph Loop kết thúc mỹ mãn.`,
          code: code,
        });
        break;
      } else {
        errorLogs = executionResult.logs;
        onProgress({
          iteration: currentIteration,
          cost: totalCostUsd,
          message: `❌ Phát hiện lỗi biên dịch/kiểm thử. Tự động chuyển stacktrace lỗi để AI tự sửa sai...`,
        });

        history.push({
          role: 'user',
          content: `Lỗi biên dịch / chạy thử nghiệm phát hiện:
\`\`\`
${executionResult.logs}
\`\`\`
Vui lòng phân tích lỗi trên và cung cấp bản vá code hoàn chỉnh mới.`,
        });
      }
    }

    return {
      currentIteration,
      totalTokensUsed,
      totalCostUsd,
      success,
      history,
      errorLogs: errorLogs || 'Không có log',
    };
  }
}
