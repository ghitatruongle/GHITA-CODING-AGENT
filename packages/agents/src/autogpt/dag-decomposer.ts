// ==============================================================================
// GHITA CODING AGENT - AutoGPT Goal Decomposition DAG Task Graph
// ==============================================================================
// Decomposes complex user goals into a Directed Acyclic Graph (DAG) of dependent tasks.
// ==============================================================================

export interface DAGTaskNode {
  id: string;
  title: string;
  description: string;
  dependencies: string[]; // List of parent task IDs required before running
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  resultOutput?: string;
}

export class DAGDecomposer {
  private nodes: Map<string, DAGTaskNode> = new Map();

  /**
   * Initialize or replace task nodes in the DAG task graph.
   */
  setTasks(nodes: DAGTaskNode[]): void {
    this.nodes.clear();
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
  }

  /**
   * Get all task nodes currently ready for execution (all dependencies completed).
   */
  getReadyTasks(): DAGTaskNode[] {
    const ready: DAGTaskNode[] = [];

    for (const node of this.nodes.values()) {
      if (node.status !== 'pending') continue;

      const allDepsCompleted = node.dependencies.every((depId) => {
        const depNode = this.nodes.get(depId);
        return depNode && depNode.status === 'completed';
      });

      if (allDepsCompleted) {
        ready.push(node);
      }
    }

    return ready;
  }

  /**
   * Update the execution status of a task node.
   */
  updateTaskStatus(id: string, status: DAGTaskNode['status'], resultOutput?: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = status;
      if (resultOutput !== undefined) {
        node.resultOutput = resultOutput;
      }
    }
  }

  /**
   * Check if all task nodes in the DAG have completed.
   */
  isCompleted(): boolean {
    return [...this.nodes.values()].every((node) => node.status === 'completed');
  }

  /**
   * Get current progress metrics.
   */
  getProgress(): { total: number; completed: number; failed: number; pending: number } {
    const all = [...this.nodes.values()];
    return {
      total: all.length,
      completed: all.filter((n) => n.status === 'completed').length,
      failed: all.filter((n) => n.status === 'failed').length,
      pending: all.filter((n) => n.status === 'pending' || n.status === 'in_progress').length,
    };
  }
}
