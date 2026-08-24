import type { BaseMessage } from '../messages/message.js';
import { ToolMessage } from '../messages/message.js';

export interface ProcessorContext {
  iteration: number;
  maxIterations: number;
  charBudget?: number;
}

export type HistoryProcessor = (messages: BaseMessage[], ctx: ProcessorContext) => BaseMessage[];

export function lastNObservations(n: number): HistoryProcessor {
  return (messages) => {
    if (n <= 0) return messages;
    let kept = 0;
    const result: BaseMessage[] = [];
    // Walk backwards, collecting into a reversed array, then reverse back.
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      if (msg instanceof ToolMessage) {
        if (kept < n) {
          result.push(msg);
          kept++;
        } else {
          const tn = msg.toolName ?? 'unknown';
          result.push(
            new ToolMessage(
              `[elided observation from tool "${tn}"]`,
              (msg as ToolMessage & { toolCallId?: string }).toolCallId ?? '',
              msg.toolName,
            ),
          );
        }
      } else {
        result.push(msg);
      }
    }
    result.reverse();
    return result;
  };
}

export function tagToolCalls(): HistoryProcessor {
  return (messages) =>
    messages.map((msg) => {
      if (!(msg instanceof ToolMessage)) return msg;
      const existing = msg.metadata ?? {};
      if (existing.tag === msg.toolName) return msg;
      const data = msg.toData();
      data.metadata = { ...existing, tag: msg.toolName };
      return new ToolMessage(
        msg.getText(),
        (msg as ToolMessage & { toolCallId?: string }).toolCallId ?? '',
        msg.toolName,
        { metadata: data.metadata },
      );
    });
}

export function cacheControl(n: number): HistoryProcessor {
  return (messages) => {
    if (n <= 0) return messages;
    const result: BaseMessage[] = [...messages];
    let marked = 0;
    for (let i = result.length - 1; i >= 0 && marked < n; i--) {
      const msg = result[i];
      if (!msg) continue;
      const data = msg.toData();
      const prev = data.metadata ?? {};
      if (prev.cache_control !== 'ephemeral') {
        data.metadata = { ...prev, cache_control: 'ephemeral' };
        if (msg instanceof ToolMessage) {
          result[i] = new ToolMessage(
            msg.getText(),
            (msg as ToolMessage & { toolCallId?: string }).toolCallId ?? '',
            msg.toolName,
            { metadata: data.metadata },
          );
        } else {
          try {
            const Ctor = msg.constructor as new (
              content: string,
              opts?: Record<string, unknown>,
            ) => BaseMessage;
            result[i] = new Ctor(msg.getText(), { metadata: data.metadata });
          } catch {}
        }
      }
      marked++;
    }
    return result;
  };
}

export function truncateByTokens(budget: number): HistoryProcessor {
  return (messages) => {
    if (budget <= 0) return messages;
    let total = 0;
    for (const m of messages) total += m.getText().length;
    if (total <= budget) return messages;
    const droppable: number[] = [];
    let seenSystem = false;
    for (let i = 0; i < messages.length; i++) {
      const mi = messages[i];
      if (!mi) continue;
      const role = (mi.toData() as { role?: string }).role;
      if (role === 'system' && !seenSystem) {
        seenSystem = true;
        continue;
      }
      droppable.push(i);
    }
    const keep = new Set<number>(Array.from({ length: messages.length }, (_, i) => i));
    let dropIdx = 0;
    while (total > budget && dropIdx < droppable.length) {
      const idx = droppable[dropIdx];
      dropIdx++;
      if (idx === undefined) break;
      const dropMsg = messages[idx];
      if (!dropMsg) continue;
      total -= dropMsg.getText().length;
      keep.delete(idx);
    }
    return messages.filter((_, i) => keep.has(i));
  };
}

export function applyHistoryProcessors(
  messages: BaseMessage[],
  processors: HistoryProcessor[],
  ctx: ProcessorContext,
): BaseMessage[] {
  let current = messages;
  for (const p of processors) {
    current = p(current, ctx);
  }
  return current;
}
