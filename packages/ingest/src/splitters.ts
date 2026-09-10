// Fixed-size, markdown-heading, code-line and recursive splitters with overlap.
// Uses native Rust addon (crates/retrieval) when available, falls back to JS.

import { loadNative } from '@ghita/native-bridge';
import type { Chunk, ChunkingOptions, IngestDocument } from './types.js';
import { contentHash } from './loaders.js';

export interface ChunkMeta {
  heading?: string;
  language?: string;
}

interface RetrievalNative {
  splitMarkdownNative(
    text: string,
    maxChunkSize?: number,
    overlap?: number,
  ): Array<{ id: number; text: string }>;
  splitCodeNative(text: string, maxChunkSize?: number): Array<{ id: number; text: string }>;
  splitFixedNative(
    text: string,
    chunkSize?: number,
    overlap?: number,
  ): Array<{ id: number; text: string }>;
}

const retrievalBridge = () =>
  loadNative<RetrievalNative>('retrieval', undefined as unknown as RetrievalNative);

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function chunkId(docPath: string, index: number): string {
  return `${contentHash(docPath)}_${index}`;
}

/** Split text into fixed-size windows with overlap. */
export function splitFixed(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1200;
  if (chunkSize <= 0) return [];
  const bridge = retrievalBridge();
  // Clamp like the Rust core: overlap ∈ [0, chunkSize/2]; non-positive
  // chunkSize yields no chunks (BUG-006 review parity guard).
  const overlap = Math.max(0, Math.min(options.overlap ?? 100, Math.floor(chunkSize / 2)));
  if (bridge.native && typeof bridge.impl?.splitFixedNative === 'function') {
    try {
      const nativeChunks = bridge.impl.splitFixedNative(text, chunkSize, overlap);
      return nativeChunks.map((c) => c.text).filter((p) => p.trim().length > 0);
    } catch {
      // fallback
    }
  }

  const parts: string[] = [];
  if (/[\ud800-\udfff]/.test(text)) {
    // Surrogate-safe path (BUG-006): window by code points so a pair is
    // never split into lone surrogates; mirrors the Rust core exactly.
    const cps = Array.from(text);
    let i = 0;
    while (i < cps.length) {
      let units = 0;
      let j = i;
      while (j < cps.length) {
        const cp = cps[j];
        if (cp === undefined || units + cp.length > chunkSize) break;
        units += cp.length;
        j++;
      }
      if (j === i) j = i + 1; // single code point wider than chunkSize
      parts.push(cps.slice(i, j).join(''));
      if (j >= cps.length) break;
      let back = overlap;
      let k = j;
      while (k > i) {
        const prev = cps[k - 1];
        if (prev === undefined || prev.length > back) break;
        back -= prev.length;
        k--;
      }
      i = k;
    }
    return parts.filter((p) => p.trim().length > 0);
  }
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    parts.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return parts.filter((p) => p.trim().length > 0);
}

/** Split markdown by headings (H1-H3), falling back to fixed windows. */
export function splitMarkdown(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1200;
  if (chunkSize <= 0) return [];
  const overlap = Math.max(0, Math.min(options.overlap ?? 100, Math.floor(chunkSize / 2)));
  const bridge = retrievalBridge();
  if (bridge.native && typeof bridge.impl?.splitMarkdownNative === 'function') {
    try {
      const nativeChunks = bridge.impl.splitMarkdownNative(text, chunkSize, overlap);
      if (nativeChunks.length > 0) {
        return nativeChunks.map((c) => c.text).filter((p) => p.trim().length > 0);
      }
    } catch {
      // fallback
    }
  }

  const lines = text.split('\n');
  const sections: Array<{ heading?: string; body: string[] }> = [];
  let current: { heading?: string; body: string[] } = { body: [] };
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (current.body.length > 0 || current.heading) sections.push(current);
      current = { heading: (headingMatch[2] ?? '').trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length > 0 || current.heading) sections.push(current);

  const parts: string[] = [];
  for (const section of sections) {
    const body = section.body.join('\n').trim();
    if (!body) {
      if (section.heading) parts.push(`## ${section.heading}`);
      continue;
    }
    const wrapped = section.heading ? `## ${section.heading}\n\n${body}` : body;
    if (wrapped.length <= chunkSize) {
      parts.push(wrapped);
    } else {
      parts.push(...splitFixed(wrapped, { ...options, chunkSize, overlap }));
    }
  }
  return parts.filter((p) => p.trim().length > 0);
}

/** Split code by lines with context windows. */
export function splitCode(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 300;
  if (chunkSize <= 0) return [];
  const lines = text.split('\n');
  const overlap = Math.max(0, Math.min(options.overlap ?? 20, Math.floor(chunkSize / 2)));
  const parts: string[] = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + chunkSize, lines.length);
    parts.push(lines.slice(start, end).join('\n'));
    if (end >= lines.length) break;
    start = end - overlap;
  }
  return parts.filter((p) => p.trim().length > 0);
}

/** Recursive splitter: paragraphs → fixed windows. */
export function splitRecursive(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1200;
  if (chunkSize <= 0) return [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parts: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if (`${buffer}\n\n${paragraph}`.length <= chunkSize) {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    } else {
      if (buffer) parts.push(buffer);
      buffer =
        paragraph.length > chunkSize ? splitFixed(paragraph, options).join('\n\n') : paragraph;
    }
  }
  if (buffer) parts.push(buffer);
  return parts.filter((p) => p.trim().length > 0);
}

/** Chunk a document by its source type. */
export function chunkDocument(
  doc: IngestDocument,
  options: ChunkingOptions = {},
  meta: ChunkMeta = {},
): Chunk[] {
  const pieces =
    doc.source === 'markdown'
      ? splitMarkdown(doc.content, options)
      : doc.source === 'code'
        ? splitCode(doc.content, options)
        : doc.source === 'json' || doc.source === 'csv'
          ? splitFixed(doc.content, options)
          : splitRecursive(doc.content, options);

  return pieces.map((text, index) => ({
    id: chunkId(doc.path, index),
    docPath: doc.path,
    index,
    text,
    tokenEstimate: estimateTokens(text),
    meta: { ...meta, heading: meta.heading },
  }));
}
