// ==============================================================================
// GHITA CODING AGENT - CrewAI Role-Based Hierarchical Task Orchestrator
// ==============================================================================
// Coordinates specialized agent roles in sequential or hierarchical delegation workflows.
// ==============================================================================

export interface CrewMember {
  id: string;
  role: 'CrewLead' | 'Architect' | 'Coder' | 'Reviewer' | 'Tester';
  name: string;
  backstory?: string;
  skills: string[];
}

export interface CrewTaskSpec {
  id: string;
  description: string;
  assignedRole: CrewMember['role'];
  expectedOutput: string;
}

export class CrewAIOrchestrator {
  private members: Map<string, CrewMember> = new Map();

  constructor(initialMembers: CrewMember[] = []) {
    for (const m of initialMembers) {
      this.members.set(m.id, m);
    }
  }

  addMember(member: CrewMember): void {
    this.members.set(member.id, member);
  }

  /**
   * Plan sequential workflow assignments for a list of task specifications.
   */
  planSequentialWorkflow(
    tasks: CrewTaskSpec[],
  ): Array<{ task: CrewTaskSpec; member?: CrewMember }> {
    return tasks.map((task) => {
      const assigned = [...this.members.values()].find((m) => m.role === task.assignedRole);
      return {
        task,
        member: assigned,
      };
    });
  }
}
