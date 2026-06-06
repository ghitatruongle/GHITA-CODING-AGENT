// ==============================================================================
// GHITA CODING AGENT - ReAct Agent Implementation
// ==============================================================================

import { HumanMessage, SystemMessage, ToolMessage } from '../messages/message.js';
import type { BaseMessage } from '../messages/message.js';
import { MiddlewarePipeline } from '../middleware/pipeline.js';
import type { MiddlewareContext } from '../middleware/types.js';
import type {
  ReActAgentConfig,
  ReActTool,
  AgentAction,
  AgentFinish,
  AgentStep,
  CreateReActAgentInput,
  ReActAgentRunResult,
  ReActAgentCallbacks,
  StructuredOutputSchema,
} from './types.js';

function generateId(): string {
  return `react_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * ReAct Agent — Reasoning + Acting loop.
 * Implements the think → act → observe cycle with middleware support.
 */
export class ReActAgent {
  readonly name: string;
  private readonly config: ReActAgentConfig;
  private readonly llmCall: CreateReActAgentInput['llmCall'];
  private readonly parseToolCalls: CreateReActAgentInput['parseToolCalls'];
  private readonly pipeline: MiddlewarePipeline;
  private readonly tools: Map<string, ReActTool>;

  constructor(input: CreateReActAgentInput) {
    this.name = input.config.name;
    this.config = input.config;
    this.llmCall = input.llmCall;
    this.parseToolCalls = input.parseToolCalls;
    this.pipeline = new MiddlewarePipeline();
    this.tools = new Map();

    for (const tool of input.config.tools ?? []) {
      this.tools.set(tool.name, tool);
    }

    for (const mw of input.config.middleware ?? []) {
      this.pipeline.use(mw);
    }
  }

  /** Run the ReAct loop */
  async run(userMessage: string, callbacks?: ReActAgentCallbacks): Promise<ReActAgentRunResult> {
    const startTime = Date.now();
    const maxIterations = this.config.maxIterations ?? 10;
    const steps: AgentStep[] = [];
    const messages: BaseMessage[] = [];
    const agentId = generateId();

    // Build initial messages
    if (this.config.systemPrompt) {
      messages.push(new SystemMessage(this.config.systemPrompt));
    }
    messages.push(new HumanMessage(userMessage));

    for (let i = 0; i < maxIterations; i++) {
      const middlewareCtx: MiddlewareContext = {
        agent: {
          id: agentId,
          name: this.name,
          role: 'executor',
          description: 'ReAct agent',
          skills: [...this.tools.keys()],
          model: this.config.model,
          status: 'working',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        messages,
        model: this.config.model,
        provider: this.config.provider,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        metadata: {
          iteration: i,
        },
      };

      // Run pre-model middleware
      const { context: ctx, shortCircuit } = await this.pipeline.runPreModel(middlewareCtx);
      if (shortCircuit) {
        messages.push(shortCircuit);
        return this.buildResult(shortCircuit.getText(), steps, messages, i + 1, startTime);
      }

      // Call LLM
      let response: BaseMessage;
      try {
        response = await this.llmCall(ctx.messages, {
          name: this.name,
          metadata: ctx.metadata,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const { retry } = await this.pipeline.runOnError(error, ctx);
        if (retry && i < maxIterations - 1) {
          console.info(`Error in ReAct loop on iteration ${i}, retrying:`, error);
          continue;
        }
        throw error;
      }

      // Run post-model middleware
      const { result: postResult, retry } = await this.pipeline.runPostModel(ctx, {
        response,
        shouldContinue: false,
      });
      if (retry && i < maxIterations - 1) {
        console.info(`Post-model retry requested at iteration ${i}`);
        continue;
      }
      response = postResult.response;

      messages.push(response);

      // Parse tool calls
      const toolCalls = this.parseToolCalls
        ? this.parseToolCalls(response)
        : this.defaultParseToolCalls(response);

      if (toolCalls.length === 0) {
        // No tool calls → agent is done
        const finish: AgentFinish = {
          returnValues: { output: response.getText() },
          output: response.getText(),
          messages,
        };
        callbacks?.onFinish?.(finish);
        await this.pipeline.runOnComplete(ctx, response);
        return this.buildResult(response.getText(), steps, messages, i + 1, startTime);
      }

      // Execute tool calls
      for (const action of toolCalls) {
        callbacks?.onStepStart?.(i, action);
        callbacks?.onToolCall?.(action.tool, action.input);

        const tool = this.tools.get(action.tool);
        if (!tool) {
          const obs = `Error: Tool "${action.tool}" not found.`;
          steps.push({ action, observation: obs });
          messages.push(new ToolMessage(obs, action.toolCallId, action.tool));
          continue;
        }

        // Pre-tool middleware
        const toolCheck = await this.pipeline.runPreTool(action.tool, action.input, ctx);
        if (!toolCheck.proceed) {
          const obs = toolCheck.reason || `Tool "${action.tool}" blocked by middleware.`;
          steps.push({ action, observation: obs });
          messages.push(new ToolMessage(obs, action.toolCallId, action.tool));
          continue;
        }

        // Execute tool
        let observation: string;
        try {
          observation = await tool.execute(toolCheck.args);
        } catch (err) {
          observation = `Error executing tool "${action.tool}": ${err instanceof Error ? err.message : String(err)}`;
        }

        // Post-tool middleware
        observation = await this.pipeline.runPostTool(action.tool, observation, ctx);

        steps.push({ action, observation });
        messages.push(new ToolMessage(observation, action.toolCallId, action.tool));
        callbacks?.onStepEnd?.(i, observation);
        callbacks?.onToolResult?.(action.tool, observation);
      }

      // Check custom stop condition
      if (this.config.stopCondition?.(steps)) {
        const lastMsg = messages[messages.length - 1];
        const output = lastMsg?.getText() ?? '';
        return this.buildResult(output, steps, messages, i + 1, startTime);
      }
    }

    // Max iterations reached
    const lastMsg = messages[messages.length - 1];
    const output = lastMsg?.getText() ?? 'Agent reached maximum iterations.';
    return this.buildResult(output, steps, messages, maxIterations, startTime);
  }

  /** Parse structured output from final response */
  parseStructuredOutput<T>(
    result: ReActAgentRunResult,
    schema: StructuredOutputSchema,
  ): T | undefined {
    if (!schema) return undefined;
    try {
      const text = result.output;
      // Try to extract JSON from the response
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (jsonMatch?.[1]) {
        return JSON.parse(jsonMatch[1].trim()) as T;
      }
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  /** Get available tool names */
  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  /** Add a tool at runtime */
  addTool(tool: ReActTool): void {
    this.tools.set(tool.name, tool);
  }

  // ---- Private Helpers ----

  private defaultParseToolCalls(message: BaseMessage): AgentAction[] {
    // If the message has structured tool_calls in metadata, use those
    const meta = message.metadata;
    if (meta?.toolCalls && Array.isArray(meta.toolCalls)) {
      return (
        meta.toolCalls as Array<{ id: string; name: string; arguments: Record<string, unknown> }>
      ).map((tc) => ({
        tool: tc.name,
        toolCallId: tc.id,
        input: tc.arguments,
      }));
    }
    return [];
  }

  private buildResult(
    output: string,
    steps: AgentStep[],
    messages: BaseMessage[],
    iterations: number,
    startTime: number,
  ): ReActAgentRunResult {
    const finish: AgentFinish = {
      returnValues: { output },
      output,
      messages,
    };
    return {
      output,
      steps,
      messages,
      finish,
      iterations,
      duration: Date.now() - startTime,
    };
  }
}

/** Factory function to create a ReActAgent */
export function createReActAgent(input: CreateReActAgentInput): ReActAgent {
  return new ReActAgent(input);
}
