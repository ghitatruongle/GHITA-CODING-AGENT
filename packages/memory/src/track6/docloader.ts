// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 6.4: Document Loader (JS fallback)
// ------------------------------------------------------------------------------
// JS-side document loader for pdf/docx/html-readability with mime detection.
// When the native crate (crates/docloader) is available, this module delegates
// to it via @ghita/native-bridge. Otherwise, it provides a pure-JS fallback
// using text extraction heuristics.
//
// Pattern: open-agent doc_loader.rs AsyncTask napi.
// ==============================================================================

export interface DocLoadResult {
  content: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  source: 'native' | 'js-fallback';
}

export interface DocLoaderOptions {
  maxContentSize?: number;
  extractMetadata?: boolean;
}

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.rtf': 'application/rtf',
};

/**
 * Detect MIME type from file extension.
 */
export function detectMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

/**
 * Load a document and extract its text content.
 * Uses native addon when available, falls back to JS heuristics.
 */
export async function loadDocument(
  filePath: string,
  content: Buffer | string,
  options: DocLoaderOptions = {},
): Promise<DocLoadResult> {
  const mimeType = detectMimeType(filePath);
  const maxContent = options.maxContentSize ?? 1_000_000;

  // Try native addon first
  try {
    const nativeResult = await tryNativeLoad(filePath, content, mimeType);
    if (nativeResult) {
      return {
        ...nativeResult,
        mimeType,
        content: nativeResult.content.slice(0, maxContent),
        source: 'native',
      };
    }
  } catch {
    // Fall through to JS fallback
  }

  // JS fallback based on MIME type
  const textContent = extractTextFallback(content, mimeType);
  const metadata = options.extractMetadata !== false ? extractBasicMetadata(content, mimeType) : {};

  return {
    content: textContent.slice(0, maxContent),
    mimeType,
    metadata,
    source: 'js-fallback',
  };
}

async function tryNativeLoad(
  filePath: string,
  content: Buffer | string,
  mimeType: string,
): Promise<{ content: string; metadata: Record<string, unknown> } | null> {
  // Dynamic require to avoid rootDir violations
  const bridgeRequire = typeof require !== 'undefined' ? require : null;
  if (!bridgeRequire) return null;

  try {
    const bridge = bridgeRequire('@ghita/native-bridge') as {
      callAddon?: (addon: string, method: string, args: unknown[]) => Promise<unknown>;
    };
    if (!bridge?.callAddon) return null;

    const result = (await bridge.callAddon('docloader', 'load_document', [
      filePath,
      typeof content === 'string'
        ? Buffer.from(content).toString('base64')
        : content.toString('base64'),
      mimeType,
    ])) as { content: string; metadata: Record<string, unknown> } | null;

    return result ?? null;
  } catch {
    return null;
  }
}

function extractTextFallback(content: Buffer | string, mimeType: string): string {
  const raw = typeof content === 'string' ? content : content.toString('utf-8');

  switch (mimeType) {
    case 'text/html':
    case 'text/markdown':
    case 'text/plain':
    case 'text/csv':
    case 'application/json':
    case 'application/xml':
      return stripHtmlTags(raw);

    case 'application/pdf':
      // PDF binary — extract readable text segments
      return extractPdfText(raw);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      // DOCX/DOC binary — extract readable text segments
      return extractBinaryText(raw);

    default:
      return extractBinaryText(raw);
  }
}

function stripHtmlTags(html: string): string {
  // Remove script/style blocks
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Replace block-level tags with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n');
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  // Collapse whitespace
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPdfText(raw: string): string {
  // Heuristic: find text between stream/endstream or BT/ET markers
  const segments: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/gi;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(raw)) !== null) {
    const segment = match[1];
    if (segment && segment.length > 10) {
      // Extract parenthesized strings (PDF text objects)
      const textMatches = [...segment.matchAll(/\(([^)]+)\)/g)];
      for (const tm of textMatches) {
        if (tm[1] && tm[1].length > 1) {
          segments.push(tm[1]);
        }
      }
    }
  }

  return segments.length > 0
    ? segments.join(' ')
    : '[PDF content — native loader required for full extraction]';
}

function extractBinaryText(raw: string): string {
  // Extract printable ASCII sequences from binary content
  const segments: string[] = [];
  const printableRegex = /[\x20-\x7E]{10,}/g;
  let match: RegExpExecArray | null;

  while ((match = printableRegex.exec(raw)) !== null) {
    segments.push(match[0]);
  }

  return segments.length > 0
    ? segments.join('\n')
    : '[Binary content — native loader required for extraction]';
}

function extractBasicMetadata(content: Buffer | string, mimeType: string): Record<string, unknown> {
  const size = typeof content === 'string' ? Buffer.byteLength(content) : content.length;
  return {
    sizeBytes: size,
    mimeType,
    extractedAt: Date.now(),
  };
}
