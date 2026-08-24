// Text loaders for md/json/csv/txt + docx (native Rust unzip+parse via the
// docloader addon when built, JS latin1/regex fallback otherwise) + optional
// pdf via injectable reader.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { loadNative } from '@ghita/native-bridge';
import type { IngestDocument, LoadResult, SourceType } from './types.js';

// Probe once at module load; `extractDocxJs` exists only in addon builds
// built with the `docx` feature.
const docloaderAddon = loadNative<{ extractDocxJs?: (data: Buffer) => string; extractPdfJs?: (data: Buffer) => string }>('docloader', {});

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

const EXT_TO_SOURCE: Record<string, SourceType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.json': 'json',
  '.csv': 'csv',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.ts': 'code',
  '.tsx': 'code',
  '.js': 'code',
  '.jsx': 'code',
  '.mjs': 'code',
  '.py': 'code',
  '.rs': 'code',
  '.go': 'code',
  '.java': 'code',
  '.c': 'code',
  '.h': 'code',
  '.cpp': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.sh': 'code',
  '.yml': 'code',
  '.yaml': 'code',
};

export function sourceOf(path: string): SourceType {
  return EXT_TO_SOURCE[extname(path).toLowerCase()] ?? 'unknown';
}

/** Extract raw `<w:t>` text runs from a .docx (zip) byte buffer. */
export function extractDocxText(buffer: Buffer): string {
  // Docx is a zip; we scan for the word/document.xml entry content between
  // the local header and the next entry, then pull <w:t> runs. This avoids a
  // native zip dependency and works for typical documents.
  const text = buffer.toString('latin1');
  const pieces: string[] = [];
  const start = text.indexOf('word/document.xml');
  if (start === -1) return '';
  const sliceStart = Math.max(0, text.indexOf('<w:document', start));
  const sliceEnd = text.indexOf('PK', sliceStart + 8);
  const xml = sliceEnd === -1 ? text.slice(sliceStart) : text.slice(sliceStart, sliceEnd);
  const wT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = wT.exec(xml)) !== null) {
    pieces.push(m[1] ?? '');
  }
  return pieces.join(' ').trim();
}

export interface PdfReader {
  (buffer: Buffer, path: string): Promise<string>;
}

/** Load one file into an IngestDocument. */
export async function loadDocument(
  path: string,
  options: { readPdf?: PdfReader } = {},
): Promise<LoadResult> {
  let buffer: Buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return { skipped: `cannot read: ${path}` };
  }
  const source = sourceOf(path);

  let content: string | undefined;
  switch (source) {
    case 'docx':
      // Native path handles DEFLATE-compressed documents (the common case);
      // the JS fallback only understands stored (uncompressed) entries.
      content = docloaderAddon.native && docloaderAddon.impl.extractDocxJs
        ? docloaderAddon.impl.extractDocxJs(buffer)
        : extractDocxText(buffer);
      break;
    case 'pdf':
      if (options.readPdf) {
        // Explicit injected reader keeps the highest priority (API compat).
        content = await options.readPdf(buffer, path);
      } else if (docloaderAddon.native && docloaderAddon.impl.extractPdfJs) {
        // Native Rust extraction (pdf-extract) — previously PDFs were skipped
        // entirely when no reader was injected.
        content = docloaderAddon.impl.extractPdfJs(buffer);
      } else {
        return { skipped: `pdf reader not configured: ${path}` };
      }
      break;
    default:
      content = buffer.toString('utf-8');
  }
  content = content.trim();
  if (!content) return { skipped: `empty file: ${path}` };

  return {
    document: {
      path,
      source,
      content,
      hash: contentHash(content),
      bytes: buffer.length,
    },
  };
}

/** Discover files under a directory (bounded recursion). */
export function discoverFiles(
  dir: string,
  extensions: string[] = Object.keys(EXT_TO_SOURCE),
): string[] {
  const out: string[] = [];
  const walk = (base: string): void => {
    let entries;
    try {
      entries = readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(base, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.includes(extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** Load every supported file under a directory. */
export async function loadDirectory(
  dir: string,
  options: { readPdf?: PdfReader } = {},
): Promise<{ documents: IngestDocument[]; skipped: string[] }> {
  const files = discoverFiles(dir);
  const documents: IngestDocument[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const result = await loadDocument(file, options);
    if (result.document) {
      // Normalize separators for cross-platform stable paths.
      documents.push({
        ...result.document,
        path: relative(dir, result.document.path).split('\\').join('/'),
      });
    } else if (result.skipped) {
      skipped.push(result.skipped);
    }
  }
  return { documents, skipped };
}

/** Guardrail (P73): redact common secret patterns before indexing. */
export function redactSecrets(content: string): string {
  return content
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, '[REDACTED:API_KEY]')
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED:AWS_KEY]')
    .replace(/\b(ghp_[A-Za-z0-9]{20,})\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\b(Bearer\s+[A-Za-z0-9._~+/=-]{16,})\b/gi, 'Bearer [REDACTED]');
}

/** Sanity: directory entries used by indexer. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
