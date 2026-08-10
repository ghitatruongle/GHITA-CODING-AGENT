// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest splitters (P66)
// ==============================================================================
// Fixed-size, markdown-heading, code-line and recursive splitters with overlap.
// ==============================================================================

import type { Chunk, ChunkingOptions, IngestDocument } from './types.js';
import { contentHash } from './loaders.js';

export interface ChunkMeta {
  heading?: string;
  language?: string;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function chunkId(docPath: string, index: number): string {
  return `${contentHash(docPath)}_${index}`;
}

/** Split text into fixed-size windows with overlap. */
export function splitFixed(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1200;
  const overlap = Math.min(options.overlap ?? 100, Math.floor(chunkSize / 2));
  const parts: string[] = [];
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
    if (wrapped.length <= (options.chunkSize ?? 1200)) {
      parts.push(wrapped);
    } else {
      parts.push(...splitFixed(wrapped, options));
    }
  }
  return parts.filter((p) => p.trim().length > 0);
}

/** Split code by lines with context windows. */
export function splitCode(text: string, options: ChunkingOptions = {}): string[] {
  const lines = text.split('\n');
  const chunkSize = options.chunkSize ?? 300;
  const overlap = Math.min(options.overlap ?? 20, Math.floor(chunkSize / 2));
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
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunkSize = options.chunkSize ?? 1200;
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
