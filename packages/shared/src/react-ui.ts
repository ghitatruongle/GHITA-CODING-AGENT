// ==============================================================================
// GHITA CODING AGENT - React UI Integration Hooks & Components
// ==============================================================================

/**
 * @deprecated Stub implementation. Use a real AI chat hook (e.g. Vercel AI SDK) instead.
 * Will emit a console.warn if called at runtime.
 */
export function useAIChat(options?: {
  api?: string;
  initialMessages?: Array<{ id: string; role: string; content: string }>;
  onFinish?: (message: Record<string, unknown>) => void;
}) {
  console.warn('[useAIChat] This is a stub. Use a real AI chat integration instead.');
  return {
    messages: options?.initialMessages || [],
    input: '',
    setInput: (_input: string) => {},
    isLoading: false,
    handleSubmit: (_e?: { preventDefault?: () => void }) => {},
    reload: async () => {},
    stop: () => {},
  };
}

/**
 * @deprecated Stub implementation. Use a real workflow visualization component instead.
 * Will emit a console.warn if called at runtime.
 */
export function WorkflowVisualizer(_props: {
  steps: Array<{ id: string; name: string; status: 'pending' | 'running' | 'completed' | 'failed' }>;
  currentStepId?: string;
}) {
  console.warn('[WorkflowVisualizer] This is a stub. Use a real workflow visualization component instead.');
  return {
    type: 'div',
    props: {
      className: 'workflow-visualizer',
      children: 'Workflow Steps Visualizer Rendered',
    }
  };
}
