// ==============================================================================
// GHITA CODING AGENT - Subagent Spawner
// ==============================================================================
export class SubagentSpawner {
    agentManager;
    activeSubagents = new Map();
    constructor(agentManager) {
        this.agentManager = agentManager;
    }
    /**
     * Spawns an isolated subagent and executes its designated task.
     */
    async spawn(input) {
        const startTime = Date.now();
        // Create/register a new managed agent for this isolated workstream
        const agent = this.agentManager.create({
            name: input.name,
            role: input.role,
            description: input.description,
            skills: input.skills,
            model: input.model,
            systemPrompt: input.systemPrompt,
        });
        const stateId = `sub_${agent.id}`;
        try {
            // Execute the task via AgentManager
            const taskResult = await this.agentManager.assignTask(agent.id, input.task);
            const completedState = {
                id: stateId,
                parentId: input.parentId,
                agent,
                task: taskResult,
                createdAt: startTime,
                completedAt: Date.now(),
            };
            this.activeSubagents.set(stateId, completedState);
            return {
                subagentId: agent.id,
                taskId: taskResult.id,
                status: taskResult.status === 'completed' ? 'completed' : 'failed',
                result: taskResult.result,
                error: taskResult.error,
                duration: Date.now() - startTime,
            };
        }
        catch (err) {
            const duration = Date.now() - startTime;
            const errorMsg = err instanceof Error ? err.message : String(err);
            return {
                subagentId: agent.id,
                taskId: 'error_task_failed',
                status: 'failed',
                error: errorMsg,
                duration,
            };
        }
        finally {
            // Clean up the subagent from the active manager to prevent memory leaks
            this.agentManager.remove(agent.id);
        }
    }
    /**
     * Spawns multiple subagents in parallel to handle concurrent workstreams.
     */
    async spawnParallel(inputs) {
        const promises = inputs.map(input => this.spawn(input));
        return Promise.all(promises);
    }
    /**
     * Spawns multiple subagents in sequence, where later agents can build upon prior results.
     */
    async spawnSequence(inputs) {
        const results = [];
        for (const input of inputs) {
            const res = await this.spawn(input);
            results.push(res);
        }
        return results;
    }
    /**
     * Lists the tracking state of recently finished/active subagents.
     */
    listStates() {
        return [...this.activeSubagents.values()];
    }
}
//# sourceMappingURL=spawner.js.map