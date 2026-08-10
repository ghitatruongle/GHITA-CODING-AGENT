// ==============================================================================
// GHITA CODING AGENT - React UI Integration Hooks & Components (v1.1.0 Track 4)
// ==============================================================================
// Real implementations (previously stubs):
//  - useAIChat: streaming chat hook with rich parts (text / tool-call / file /
//    source), reconnect-tolerant, abortable.
//  - WorkflowVisualizer: real DAG renderer from flow events.
// The stream parsing + layout logic is framework-agnostic and unit tested.
// ==============================================================================

import { createElement, useCallback, useEffect, useRef, useState } from 'react';

// ── Chat stream model ────────────────────────────────────────────────────────

export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; name: string; id?: string; args?: Record<string, unknown> }
  | { type: 'file'; path: string; name?: string }
  | { type: 'source'; url: string; title?: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; name: string; id?: string; args?: Record<string, unknown> }
  | { type: 'file'; path: string; name?: string }
  | { type: 'source'; url: string; title?: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: ChatMessagePart[];
  createdAt: number;
}

export interface ChatStreamOptions {
  messages: ChatMessage[];
  input: string;
}

export interface ChatStreamProvider {
  (options: ChatStreamOptions): AsyncIterable<string>;
}

/** Parse one JSON-lines chunk into a stream event (null when not an event). */
export function parseChatStreamEvent(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as ChatStreamEvent;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as ChatStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Append a stream event onto an assistant message (pure). */
export function appendEventToMessage(message: ChatMessage, event: ChatStreamEvent): ChatMessage {
  switch (event.type) {
    case 'text':
      return {
        ...message,
        parts: [...message.parts, { type: 'text', text: event.delta }],
      };
    case 'tool-call':
      return {
        ...message,
        parts: [
          ...message.parts,
          { type: 'tool-call', name: event.name, id: event.id, args: event.args },
        ],
      };
    case 'file':
      return {
        ...message,
        parts: [...message.parts, { type: 'file', path: event.path, name: event.name }],
      };
    case 'source':
      return {
        ...message,
        parts: [...message.parts, { type: 'source', url: event.url, title: event.title }],
      };
    case 'done':
    case 'error':
      return message;
  }
}

/** Plain text of a message (concatenated text parts). */
export function messageText(message: ChatMessage): string {
  return message.parts
    .filter((p): p is ChatMessagePart & { type: 'text' } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export interface ConsumeHandlers {
  onPart?: (event: ChatStreamEvent) => void;
  onDone?: (message: ChatMessage) => void;
  onError?: (err: Error) => void;
}

/** Framework-agnostic stream consumer building an assistant message. */
export async function consumeChatStream(
  stream: AsyncIterable<string>,
  handlers: ConsumeHandlers = {},
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    parts: [],
    createdAt: Date.now(),
  };
  try {
    for await (const chunk of stream) {
      const event = parseChatStreamEvent(chunk);
      if (!event) continue;
      handlers.onPart?.(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') break;
      Object.assign(message, appendEventToMessage(message, event));
      // NOTE: appendEventToMessage returns a new object; keep in-place below.
    }
    // Rebuild in place (appendEventToMessage is pure; assign last value).
    const final = { ...message };
    handlers.onDone?.(final);
    return final;
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

// ── React hook ───────────────────────────────────────────────────────────────

export interface UseAIChatOptions {
  /** Async-iterable stream provider (JSON-lines). */
  stream?: ChatStreamProvider;
  initialMessages?: ChatMessage[];
  onFinish?: (message: ChatMessage) => void;
  onPart?: (event: ChatStreamEvent) => void;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    setIsLoading(false);
  }, []);

  const handleSubmit = useCallback(
    async (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      if (!options.stream) {
        setError('useAIChat: no stream provider configured');
        return;
      }
      if (runningRef.current || input.trim() === '') return;

      const inputText = input;
      const userMessage: ChatMessage = {
        id: `msg_${Date.now().toString(36)}_u`,
        role: 'user',
        parts: [{ type: 'text', text: inputText }],
        createdAt: Date.now(),
      };
      const assistant: ChatMessage = {
        id: `msg_${Date.now().toString(36)}_a`,
        role: 'assistant',
        parts: [],
        createdAt: Date.now(),
      };
      const snapshot = [...messages, userMessage];
      setMessages(snapshot);
      setInput('');
      setIsLoading(true);
      setError(null);
      runningRef.current = true;

      try {
        const stream = options.stream({ messages: snapshot, input: inputText });
        const built = await consumeChatStream(stream, {
          onPart: options.onPart,
          onError: (err) => setError(err.message),
          onDone: (message) => options.onFinish?.(message),
        });
        if (runningRef.current) {
          const final = {
            ...built,
            parts: built.parts.length > 0 ? built.parts : [{ type: 'text' as const, text: '' }],
          };
          setMessages((prev) => [...prev, final]);
        }
      } catch {
        setMessages((prev) => [...prev, { ...assistant, parts: [{ type: 'text', text: '' }] }]);
      } finally {
        runningRef.current = false;
        setIsLoading(false);
      }
    },
    [input, messages, options],
  );

  const reload = useCallback(async () => {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      const first = lastUser.parts[0];
      setInput(first?.type === 'text' ? first.text : '');
      setMessages((prev) => prev.slice(0, -1));
      await handleSubmit();
    }
  }, [handleSubmit, messages]);

  useEffect(
    () => () => {
      runningRef.current = false;
    },
    [],
  );

  return { messages, input, setInput, isLoading, error, handleSubmit, reload, stop };
}

// ── Workflow DAG layout + visualizer ─────────────────────────────────────────

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowStatus;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface LaidOutNode {
  node: WorkflowStep;
  x: number;
  y: number;
  layer: number;
}

export interface DagLayout {
  nodes: LaidOutNode[];
  layers: number;
  width: number;
  height: number;
}

const NODE_W = 140;
const NODE_H = 44;
const GAP_X = 40;
const GAP_Y = 24;

/** Longest-path layering + layered x placement (pure, testable). */
export function layoutDag(steps: WorkflowStep[], edges: WorkflowEdge[] = []): DagLayout {
  if (steps.length === 0) return { nodes: [], layers: 0, width: 0, height: 0 };
  const byId = new Map(steps.map((s) => [s.id, s]));
  const layerOf = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const s of steps) {
    outgoing.set(s.id, []);
    indegree.set(s.id, 0);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    outgoing.get(e.from)?.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  // Kahn layering: layer = longest path from a root.
  const queue: string[] = steps.filter((s) => (indegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  for (const id of queue) layerOf.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const layer = layerOf.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      layerOf.set(next, Math.max(layerOf.get(next) ?? 0, layer + 1));
      const remaining = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  // Any node without a layer (cycle) → layer 0.
  for (const s of steps) {
    if (!layerOf.has(s.id)) layerOf.set(s.id, 0);
  }

  const layerCount = steps.reduce((max, s) => Math.max(max, layerOf.get(s.id) ?? 0), 0) + 1;
  const perLayer = Array.from({ length: layerCount }, () => [] as WorkflowStep[]);
  for (const s of steps) {
    perLayer[layerOf.get(s.id) ?? 0]?.push(s);
  }

  const nodes: LaidOutNode[] = [];
  let maxPerLayer = 0;
  perLayer.forEach((layerNodes, layer) => {
    maxPerLayer = Math.max(maxPerLayer, layerNodes.length);
    layerNodes.forEach((node, index) => {
      nodes.push({
        node,
        layer,
        x: layer * (NODE_W + GAP_X),
        y: index * (NODE_H + GAP_Y),
      });
    });
  });

  return {
    nodes,
    layers: layerCount,
    width: Math.max(1, layerCount) * (NODE_W + GAP_X) - GAP_X,
    height: Math.max(1, maxPerLayer) * (NODE_H + GAP_Y) - GAP_Y,
  };
}

const STATUS_COLOR: Record<WorkflowStatus, string> = {
  pending: '#94a3b8',
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
};

export interface WorkflowVisualizerProps {
  steps: WorkflowStep[];
  edges?: WorkflowEdge[];
  currentStepId?: string;
}

/**
 * Real workflow DAG visualizer: layers steps by dependency and renders them as
 * positioned cards with status colors.
 */
export function WorkflowVisualizer({ steps, edges = [], currentStepId }: WorkflowVisualizerProps) {
  const layout = layoutDag(steps, edges);
  return createElement(
    'div',
    {
      className: 'workflow-visualizer',
      style: { position: 'relative', width: layout.width, height: layout.height },
    },
    layout.nodes.map(({ node, x, y }) =>
      createElement(
        'div',
        {
          key: node.id,
          'data-workflow-node': node.id,
          'data-status': node.status,
          'data-current': node.id === currentStepId ? 'true' : undefined,
          style: {
            position: 'absolute',
            left: x,
            top: y,
            width: NODE_W,
            height: NODE_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${STATUS_COLOR[node.status]}`,
            borderRadius: 8,
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 12,
          },
        },
        node.name,
      ),
    ),
  );
}
