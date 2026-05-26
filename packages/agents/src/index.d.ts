import type { Agent, AgentGroup, AgentRole, AgentTask } from '@ghita/shared';
import type { AgentMemory } from '@ghita/memory';
export interface SkillRegistry {
    [key: string]: any;
}
export { HumanMessage, AIMessage, SystemMessage, ToolMessage, FunctionMessage, messageFromData, } from './messages/message.js';
export type { MessageRole, ContentType, ContentPart, ToolCall, MessageMetadata, BaseMessageData, HumanMessageData, AIMessageData, SystemMessageData, ToolMessageData, FunctionMessageData, MessageData, } from './messages/types.js';
export { BaseMessage } from './messages/message.js';
export { ReActAgent, createReActAgent } from './react/agent.js';
export type { ReActAgentConfig, ReActTool, AgentAction, AgentFinish, AgentStep, CreateReActAgentInput, ReActAgentRunResult, ReActAgentCallbacks, StructuredOutputSchema, } from './react/types.js';
export { MiddlewarePipeline } from './middleware/pipeline.js';
export type { AgentMiddleware, MiddlewareContext, PreModelResult, PostModelResult, AgentStepContext, AgentStepResult, HumanApprovalRequest, HumanApprovalResponse, } from './middleware/types.js';
export { Flow, createStep } from './flow/flow.js';
export type { FlowStep, FlowStepResult, FlowContext, FlowConfig, FlowRunResult, FlowProcessMode, } from './flow/types.js';
export { LangGraphAdapter } from './adapters/langgraph.js';
export { OpenAIAgentsAdapter } from './adapters/openai-agents.js';
export type { AgentAdapter, AdapterConvertedConfig, AdapterRunResult, LangGraphAgentConfig, LangGraphTool, LangGraphNode, LangGraphEdge, OpenAIAgentConfig, OpenAIAgentTool, OpenAIAgentResult, } from './adapters/types.js';
export { Runnable, LambdaRunnable, runnable, sequence, parallel } from './pipeline/runnable.js';
export type { RunnableConfig, StreamChunk, RunnableInput, TransformFn, StreamTransformFn, } from './pipeline/types.js';
export { InMemoryStorage } from './storage/memory.js';
export { FileSystemStorage } from './storage/filesystem.js';
export { EncoderBackedStorage, JSONEncoder } from './storage/encoder.js';
export type { StorageBackend, SerializedEntry, StorageOptions, EncoderFn, DecoderFn, } from './storage/types.js';
export type { FileSystemStorageOptions } from './storage/filesystem.js';
export { HubClient } from './hub/hub.js';
export type { HubPrompt, HubConfig, HubSearchQuery, HubPushInput, HubCacheEntry, } from './hub/types.js';
export declare const AGENTS_VERSION = "0.1.0";
export type AgentStatus = 'idle' | 'working' | 'completed' | 'error';
export interface ManagedAgent extends Agent {
    status: AgentStatus;
    createdAt: number;
    updatedAt: number;
}
export interface AgentRuntimeContext {
    agent: ManagedAgent;
    task: AgentTask;
    skills?: SkillRegistry;
    memory?: AgentMemory;
}
export type AgentRuntime = (context: AgentRuntimeContext) => Promise<string>;
export interface CreateAgentInput {
    name: string;
    role: AgentRole;
    description: string;
    skills?: string[];
    model?: string;
    systemPrompt?: string;
}
export interface CreateGroupInput {
    name: string;
    description: string;
    agents?: string[];
    task?: string;
}
export declare class AgentManager {
    private readonly runtime;
    private readonly skills?;
    private readonly memory?;
    private readonly agents;
    private readonly tasks;
    constructor(runtime?: AgentRuntime, skills?: SkillRegistry | undefined, memory?: AgentMemory | undefined);
    create(input: CreateAgentInput): ManagedAgent;
    register(agent: Agent): ManagedAgent;
    update(id: string, patch: Partial<Omit<ManagedAgent, 'id' | 'createdAt'>>): ManagedAgent;
    remove(id: string): boolean;
    get(id: string): ManagedAgent | undefined;
    list(): ManagedAgent[];
    listByRole(role: AgentRole): ManagedAgent[];
    listTasks(agentId?: string): AgentTask[];
    assignTask(agentId: string, description: string, groupId?: string): Promise<AgentTask>;
}
export declare class AgentGroupManager {
    private readonly agents;
    private readonly groups;
    constructor(agents: AgentManager);
    create(input: CreateGroupInput): AgentGroup;
    register(group: AgentGroup): AgentGroup;
    get(id: string): AgentGroup | undefined;
    list(): AgentGroup[];
    addAgent(groupId: string, agentId: string): AgentGroup;
    removeAgent(groupId: string, agentId: string): AgentGroup;
    runGroup(groupId: string, taskDescription?: string): Promise<AgentTask[]>;
}
export declare function createDefaultAgentManager(skills?: SkillRegistry, memory?: AgentMemory): AgentManager;
export declare function createDefaultAgentGroupManager(agentManager: AgentManager): AgentGroupManager;
export { SubagentSpawner } from './subagent/spawner.js';
export type { SubagentSpawnInput, SubagentSpawnResult, SubagentState } from './subagent/types.js';
export { CronScheduler } from './scheduler/cron.js';
export type { ScheduledTaskConfig, ScheduledTask } from './scheduler/types.js';
export { DebateEngine } from './orchestrator/debateEngine.js';
export type { DebateResult, DebateCallbacks, DebateEngineOptions } from './orchestrator/debateEngine.js';
export { GhitAgentClient } from './sdk/client.js';
export type { AgentSDKConfig, SendMessageOptions, AgentMessage } from './sdk/types.js';
export { AgentProtocolServer } from './protocol/ap.js';
export type { APTask, APStep, APArtifact } from './protocol/ap.js';
export { AgentRouter } from './router/router.js';
export type { ComplexityLevel, RouteResolution } from './router/router.js';
export { WorkflowAgent } from './workflow/engine.js';
export type { WorkflowStep, WorkflowCallbacks } from './workflow/engine.js';
export { ASTLockEngine, ASTLockMiddleware, buildHierarchy, computeSemanticHash, loadASTLockConfig } from './checker/astLock.js';
export type { HierarchicalSymbol, ASTLockConfig } from './checker/astLock.js';
export { GitSafePointManager, GitSafePointMiddleware } from './git/workflow.js';
export { MarkdownRulesChecker, MarkdownChecksMiddleware } from './checker/markdownRules.js';
export type { MarkdownRule, CheckIssue } from './checker/markdownRules.js';
//# sourceMappingURL=index.d.ts.map