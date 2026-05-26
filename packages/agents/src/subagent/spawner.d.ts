import type { AgentManager } from '../index.js';
import type { SubagentSpawnInput, SubagentSpawnResult, SubagentState } from './types.js';
export declare class SubagentSpawner {
    private readonly agentManager;
    private readonly activeSubagents;
    constructor(agentManager: AgentManager);
    /**
     * Spawns an isolated subagent and executes its designated task.
     */
    spawn(input: SubagentSpawnInput): Promise<SubagentSpawnResult>;
    /**
     * Spawns multiple subagents in parallel to handle concurrent workstreams.
     */
    spawnParallel(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]>;
    /**
     * Spawns multiple subagents in sequence, where later agents can build upon prior results.
     */
    spawnSequence(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]>;
    /**
     * Lists the tracking state of recently finished/active subagents.
     */
    listStates(): SubagentState[];
}
//# sourceMappingURL=spawner.d.ts.map