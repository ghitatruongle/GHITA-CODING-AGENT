// ==============================================================================
// v0.2.5 Agents Modules Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { AutoRepairGate } from '../src/checker/autoRepairGate.js';
import { SwarmSpawner } from '../src/subagent/swarmSpawner.js';
import { DAGDecomposer } from '../src/autogpt/dag-decomposer.js';
import { CrewAIOrchestrator } from '../src/crew/crewai-orchestrator.js';

describe('v0.2.5 Super-Agent Modules', () => {
  it('should run AutoRepairGate until tests pass', async () => {
    let runs = 0;
    const repairGate = new AutoRepairGate({
      maxAttempts: 3,
      testRunnerCommand: 'npm test',
      runCommand: async () => {
        runs++;
        return {
          passed: runs >= 2,
          exitCode: runs >= 2 ? 0 : 1,
          stdout: runs >= 2 ? 'All tests passed' : '1 test failed',
          stderr: '',
        };
      },
      agentFixer: async (_log, attempt) => `Fix attempt #${attempt}`,
    });

    const result = await repairGate.runAutoRepair();
    expect(result.success).toBe(true);
    expect(runs).toBe(2);
  });

  it('should execute parallel sub-agent swarm tasks', async () => {
    const results = await SwarmSpawner.runSwarm(
      [
        { id: 'task-1', name: 'Task 1', instruction: 'Do task 1' },
        { id: 'task-2', name: 'Task 2', instruction: 'Do task 2' },
      ],
      async (t) => ({ success: true, output: `Completed ${t.name}` }),
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(true);
    expect(results[1]?.output).toContain('Completed Task 2');
  });

  it('should decompose tasks in AutoGPT DAG Task Graph', () => {
    const dag = new DAGDecomposer();
    dag.setTasks([
      { id: 't1', title: 'Task 1', description: 'Base task', dependencies: [], status: 'pending' },
      {
        id: 't2',
        title: 'Task 2',
        description: 'Dependent task',
        dependencies: ['t1'],
        status: 'pending',
      },
    ]);

    const ready1 = dag.getReadyTasks();
    expect(ready1).toHaveLength(1);
    expect(ready1[0]?.id).toBe('t1');

    dag.updateTaskStatus('t1', 'completed');
    const ready2 = dag.getReadyTasks();
    expect(ready2).toHaveLength(1);
    expect(ready2[0]?.id).toBe('t2');
  });

  it('should orchestrate roles in CrewAIOrchestrator', () => {
    const crew = new CrewAIOrchestrator([
      { id: 'm1', role: 'Coder', name: 'Developer Agent', skills: ['file.write'] },
    ]);

    const plan = crew.planSequentialWorkflow([
      {
        id: 'ts1',
        description: 'Implement feature',
        assignedRole: 'Coder',
        expectedOutput: 'Clean code',
      },
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.member?.name).toBe('Developer Agent');
  });
});
