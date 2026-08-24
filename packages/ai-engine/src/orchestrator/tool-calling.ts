// MCP tools, built-in tools, hooks delegation, and context management.

import type {
  OrchestratorContext,
  MCPTool,
  MCPToolResult,
  HookConfig,
  HookResult,
  BuiltInTool,
  ChatMessage,
} from './types.js';

// --- MCP Tools ---

/** Get all MCP tools */
export function getMCPTools(ctx: OrchestratorContext): MCPTool[] {
  return ctx.mcpClient.getAllTools();
}

/** Call an MCP tool */
export async function callMCPTool(
  ctx: OrchestratorContext,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolResult> {
  return ctx.mcpClient.callTool(serverName, toolName, args);
}

// --- Hooks ---

/** Load hooks config */
export function loadHooks(ctx: OrchestratorContext, hooks: HookConfig[]): void {
  ctx.hookRunner.loadHooks(hooks);
}

/** Run pre-tool hooks */
export async function runPreToolHooks(
  ctx: OrchestratorContext,
  toolName: string,
  toolArgs?: Record<string, unknown>,
): Promise<HookResult[]> {
  return ctx.hookRunner.runPreTool(toolName, toolArgs);
}

/** Run post-tool hooks */
export async function runPostToolHooks(
  ctx: OrchestratorContext,
  toolName: string,
  toolArgs?: Record<string, unknown>,
  toolResult?: string,
): Promise<HookResult[]> {
  return ctx.hookRunner.runPostTool(toolName, toolArgs, toolResult);
}

// --- Built-in Tools ---

/** Get built-in tool by name */
export function getBuiltInTool(ctx: OrchestratorContext, name: string): BuiltInTool | undefined {
  return ctx.builtInTools.find((t) => t.name === name);
}

/** Call a built-in tool */
export async function callBuiltInTool(
  ctx: OrchestratorContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = getBuiltInTool(ctx, name);
  if (!tool) throw new Error(`Built-in tool "${name}" not found`);
  return tool.execute(args);
}

// --- Context Management ---

/** Check if context needs compacting */
export function needsContextCompact(
  ctx: OrchestratorContext,
  messages: ChatMessage[],
): boolean {
  return ctx.contextManager.needsCompact(messages);
}

/** Compact messages */
export function compactContext(
  ctx: OrchestratorContext,
  messages: ChatMessage[],
): ChatMessage[] {
  return ctx.contextManager.compact(messages);
}

/** Get context usage */
export function getContextUsage(
  ctx: OrchestratorContext,
  messages: ChatMessage[],
): { used: number; max: number; percentage: number } {
  return ctx.contextManager.getUsage(messages);
}
