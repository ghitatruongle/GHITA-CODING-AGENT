// Merges multiple ChatMessage lists into a single prompt that can be sent
// to a provider in one round-trip, then splits the response back.

import type { ChatMessage, ChatResponse } from '../types.js';
import type { BatchRequest, ConcatenatedPrompt, ConcatenationStrategy } from './types.js';
import { estimateMessagesTokens } from '../utils/token-counter.js';

// System preamble used to tell the model it should produce a structured
// response covering N sub-requests.

const SYSTEM_PREAMBLE = `You are a batch assistant. The user will send you multiple independent requests separated by delimiters. Respond to EACH request in order, in the SAME format and ORDER. Use the exact delimiter "---RESPONSE_N---" (N = 1,2,3,...) BEFORE each response, and "---END_N---" AFTER each response. Do not add commentary, summaries, or anything outside the delimiters.`;

const RESPONSE_OPEN = (i: number) => `---RESPONSE_${i}---`;
const RESPONSE_CLOSE = (i: number) => `---END_${i}---`;

// Public API

/**
 * Concatenate multiple requests into a single prompt.
 * The result is a `ConcatenatedPrompt` that the batch engine can dispatch
 * to a provider in one call.
 */
export function concatenateRequests(
  requests: BatchRequest[],
  strategy: ConcatenationStrategy = 'numbered',
  maxTokens = 8000,
): ConcatenatedPrompt {
  if (requests.length === 0) {
    throw new Error('concatenateRequests: requests array is empty');
  }

  const firstRequest = requests[0] as BatchRequest;
  const provider = firstRequest.provider;
  const model = firstRequest.model;
  const tag = firstRequest.tag ?? 'default';

  // Check consistency
  for (const r of requests) {
    if (r.provider !== provider) {
      throw new Error(
        `concatenateRequests: mixed providers in batch (${provider} vs ${r.provider})`,
      );
    }
    if (r.model !== model) {
      throw new Error(`concatenateRequests: mixed models in batch (${model} vs ${r.model})`);
    }
    if ((r.tag ?? 'default') !== tag) {
      throw new Error(`concatenateRequests: mixed tags in batch (${tag} vs ${r.tag})`);
    }
  }

  const totalTokensIfSeparate = requests.reduce(
    (sum, r) => sum + estimateMessagesTokens(r.messages, model),
    0,
  );

  const messages = buildMessages(requests, strategy);
  const estimatedTokens = estimateMessagesTokens(messages, model);
  const tokensSaved = Math.max(0, totalTokensIfSeparate - estimatedTokens);
  const savingsRatio = totalTokensIfSeparate > 0 ? tokensSaved / totalTokensIfSeparate : 0;

  // Truncate if too large: drop oldest, lowest-priority requests
  let finalRequests = requests;
  let finalMessages = messages;
  if (estimatedTokens > maxTokens && finalRequests.length > 1) {
    const trimmed = trimToTokenBudget(requests, strategy, maxTokens);
    finalRequests = trimmed.requests;
    finalMessages = trimmed.messages;
  }

  return {
    tag,
    provider,
    model,
    requests: finalRequests,
    messages: finalMessages,
    estimatedTokens: estimateMessagesTokens(finalMessages, model),
    tokensSaved,
    savingsRatio,
  };
}

// Internal: Build the concatenated message list

function buildMessages(requests: BatchRequest[], strategy: ConcatenationStrategy): ChatMessage[] {
  const out: ChatMessage[] = [];

  out.push({ role: 'system', content: SYSTEM_PREAMBLE });

  for (let i = 0; i < requests.length; i++) {
    const r = requests[i] as BatchRequest;
    const userContent = formatUserContent(r, i + 1, strategy);
    out.push({ role: 'user', content: userContent });
  }

  return out;
}

function formatUserContent(
  request: BatchRequest,
  index: number,
  strategy: ConcatenationStrategy,
): string {
  switch (strategy) {
    case 'sequential':
      return request.messages.map((m) => `[${m.role.toUpperCase()}] ${m.content}`).join('\n');

    case 'numbered': {
      const header = `=== Request ${index} (id=${request.id}) ===`;
      const body = request.messages.map((m) => `[${m.role}] ${m.content}`).join('\n');
      return `${header}\n${body}`;
    }

    case 'jsonl': {
      const lines = request.messages.map((m) =>
        JSON.stringify({ role: m.role, content: m.content }),
      );
      return `{"request":${index},"id":"${request.id}","messages":[\n${lines.join(',\n')}\n]}`;
    }

    case 'xml-tags': {
      const body = request.messages
        .map((m) => `  <message role="${m.role}">\n    ${escapeXml(m.content)}\n  </message>`)
        .join('\n');
      return `<request id="${request.id}" index="${index}">\n${body}\n</request>`;
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Internal: Trim to fit token budget (drop lowest-priority / oldest)

interface TrimmedResult {
  requests: BatchRequest[];
  messages: ChatMessage[];
}

function trimToTokenBudget(
  requests: BatchRequest[],
  strategy: ConcatenationStrategy,
  maxTokens: number,
): TrimmedResult {
  // Sort by priority desc, then by enqueue time asc (older first to drop)
  const sorted = [...requests].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return a.enqueuedAt - b.enqueuedAt;
  });

  let kept = [...sorted];
  while (kept.length > 1) {
    const messages = buildMessages(kept, strategy);
    const tokens = estimateMessagesTokens(messages, (kept[0] as BatchRequest).model);
    if (tokens <= maxTokens) break;
    // Drop the last (lowest-priority, oldest) request
    kept = kept.slice(0, -1);
  }

  return { requests: kept, messages: buildMessages(kept, strategy) };
}

// Split a concatenated model response back into per-request results

export interface SplitResult {
  id: string;
  content: string;
}

/**
 * Split a single ChatResponse.content into N chunks, one per original request.
 * Returns content strings in the original request order.
 */
export function splitResponse(response: ChatResponse, requests: BatchRequest[]): SplitResult[] {
  const out: SplitResult[] = new Array(requests.length);
  const text = response.content ?? '';

  // Try to find delimiter pairs ---RESPONSE_N--- ... ---END_N---
  for (let i = 0; i < requests.length; i++) {
    const idx = i + 1;
    const openTag = RESPONSE_OPEN(idx);
    const closeTag = RESPONSE_CLOSE(idx);
    const openIdx = text.indexOf(openTag);
    if (openIdx === -1) {
      out[i] = { id: (requests[i] as BatchRequest).id, content: '' };
      continue;
    }
    const afterOpen = openIdx + openTag.length;
    const closeIdx = text.indexOf(closeTag, afterOpen);
    if (closeIdx === -1) {
      out[i] = { id: (requests[i] as BatchRequest).id, content: text.slice(afterOpen).trim() };
      continue;
    }
    out[i] = {
      id: (requests[i] as BatchRequest).id,
      content: text.slice(afterOpen, closeIdx).trim(),
    };
  }

  // Fallback: if we got nothing back, split by double newline and zip
  const allEmpty = out.every((r) => !r.content);
  if (allEmpty && requests.length > 0) {
    const fallback = text
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i < requests.length; i++) {
      out[i] = {
        id: (requests[i] as BatchRequest).id,
        content: fallback[i] ?? text,
      };
    }
  }

  return out;
}
