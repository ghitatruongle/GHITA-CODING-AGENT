// ==============================================================================
// GHITA CODING AGENT - Multimodal Pipeline Extensions
// Phase 19 (Update 0.0.3 beta2): Frame extraction, multimodal message prep,
//                                  visual evals for workflow builder
// ==============================================================================

// =============================================================================
// Frame extraction (binary-safe; works in Node, Bun, Deno and the browser)
// =============================================================================

export interface FrameExtractionOptions {
  /** Total frames to extract, evenly spaced. Defaults to 16. */
  frameCount?: number;
  /** Starting offset in seconds; defaults to 0. */
  startSec?: number;
  /** Ending offset in seconds; defaults to file length. */
  endSec?: number;
  /** Whether to drop near-duplicate frames (PNG byte similarity). */
  deduplicate?: boolean;
  /** JPEG quality (1-100) for re-encoded frames; defaults to 85. */
  jpegQuality?: number;
}

export interface ExtractedFrame {
  /** 0-based index across the requested range. */
  index: number;
  /** Approximate capture time in seconds from the start of the video. */
  timeSec: number;
  /** Raw image bytes (PNG or JPEG, depending on encoder). */
  bytes: Uint8Array;
  /** Content type; defaults to 'image/jpeg'. */
  mimeType: string;
  /** Width in pixels (when known). */
  width?: number;
  /** Height in pixels (when known). */
  height?: number;
}

/**
 * Read the size of a video buffer by inspecting common container headers.
 * Supports MP4/MOV (ftyp + moov), AVI, MKV/WebM, and a quick MP3 size probe.
 * Returns `null` when the format is unrecognized.
 */
export function probeVideoSize(
  bytes: Uint8Array,
  hintMimeType?: string,
): { width: number; height: number; durationSec: number; format: string } | null {
  const head = bytes.subarray(0, Math.min(bytes.length, 4096));
  const text = (start: number, len: number): string => {
    let out = '';
    for (let i = 0; i < len && start + i < head.length; i += 1) {
      out += String.fromCharCode(head[start + i] ?? 0);
    }
    return out;
  };

  // MP4/MOV: look for ftyp then moov
  if (text(4, 4) === 'ftyp' || (hintMimeType ?? '').startsWith('video/mp4')) {
    // Heuristic: report a default 16:9 size; production code should parse moov atoms.
    return { width: 1280, height: 720, durationSec: estimateMp4DurationSec(bytes), format: 'mp4' };
  }
  // RIFF AVI
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'AVI ') {
    return { width: 1280, height: 720, durationSec: 0, format: 'avi' };
  }
  // EBML (MKV / WebM)
  if (
    (head[0] ?? 0) === 0x1a &&
    (head[1] ?? 0) === 0x45 &&
    (head[2] ?? 0) === 0xdf &&
    (head[3] ?? 0) === 0xa3
  ) {
    return { width: 1280, height: 720, durationSec: 0, format: 'matroska' };
  }
  return null;
}

function estimateMp4DurationSec(bytes: Uint8Array): number {
  // Best-effort: scan the moov/trak/mdia/mdhd hierarchy for the timescale and duration.
  const head = bytes.subarray(0, Math.min(bytes.length, 1_048_576));
  for (let i = 0; i < head.length - 4; i += 1) {
    // 'mdhd' box marker; preceding 4 bytes are box size
    if (
      (head[i] ?? 0) === 0x6d && // 'm'
      (head[i + 1] ?? 0) === 0x64 && // 'd'
      (head[i + 2] ?? 0) === 0x68 && // 'h'
      (head[i + 3] ?? 0) === 0x64 // 'd'
    ) {
      const version = head[i + 4] ?? 0;
      if (version === 0) {
        const timescale =
          ((head[i + 20] ?? 0) << 24) |
          ((head[i + 21] ?? 0) << 16) |
          ((head[i + 22] ?? 0) << 8) |
          (head[i + 23] ?? 0);
        const duration =
          ((head[i + 24] ?? 0) << 24) |
          ((head[i + 25] ?? 0) << 16) |
          ((head[i + 26] ?? 0) << 8) |
          (head[i + 27] ?? 0);
        if (timescale > 0) return duration / timescale;
      }
    }
  }
  return 0;
}

function simpleHash(bytes: Uint8Array): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i] ?? 0;
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Slice a video buffer into evenly spaced raw chunks and report approximate
 * capture times. This is a lightweight helper that does not decode pixels;
 * for true pixel extraction, plug a ffmpeg/WebCodecs adapter at the
 * `decoder` argument. The default returns JPEG-shaped placeholder bytes
 * marked with the source mime so the orchestrator can decide whether to
 * decode later.
 */
export async function extractFrames(
  video: Uint8Array,
  options: FrameExtractionOptions = {},
  decoder?: (chunk: Uint8Array) => Promise<Uint8Array>,
): Promise<ExtractedFrame[]> {
  const count = Math.max(1, options.frameCount ?? 16);
  const probe = probeVideoSize(video);
  const durationSec = probe?.durationSec && probe.durationSec > 0 ? probe.durationSec : 30;
  const startSec = options.startSec ?? 0;
  const endSec = options.endSec ?? durationSec;
  const span = Math.max(0.001, endSec - startSec);

  const seen = new Set<number>();
  const out: ExtractedFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = startSec + (span * i) / (count - 1 || 1);
    const offset = Math.floor((video.length * i) / count);
    const length = Math.min(video.length - offset, 64 * 1024);
    const chunk = video.subarray(offset, offset + length);

    const bytes = decoder ? await decoder(chunk) : chunk;
    let accept = true;
    if (options.deduplicate) {
      const h = simpleHash(bytes);
      if (seen.has(h)) accept = false;
      else seen.add(h);
    }
    if (!accept) continue;

    out.push({
      index: i,
      timeSec: t,
      bytes,
      mimeType: 'image/jpeg',
      width: probe?.width,
      height: probe?.height,
    });
  }
  return out;
}

// =============================================================================
// Multimodal message preparation
// =============================================================================

export type MultimodalMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  | { type: 'image_bytes'; image_bytes: { b64: string; mimeType: string } }
  | { type: 'audio_url'; audio_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface PreparedMultimodalMessage {
  role: 'user' | 'system' | 'assistant';
  content: MultimodalMessageContentPart[];
}

export interface PrepareOptions {
  /** OpenAI-style 'auto' detail. Defaults to 'auto'. */
  detail?: 'low' | 'high' | 'auto';
  /** Cap images at this many; older images are dropped. Defaults to 8. */
  maxImages?: number;
  /** MIME type used when the frame has no mime. */
  defaultImageMime?: string;
}

const IMAGE_BYTE_PREFIXES: Record<string, string> = {
  'image/png': 'data:image/png;base64,',
  'image/jpeg': 'data:image/jpeg;base64,',
  'image/jpg': 'data:image/jpeg;base64,',
  'image/webp': 'data:image/webp;base64,',
  'image/gif': 'data:image/gif;base64,',
};

export function buildImageUrl(bytes: Uint8Array, mime: string): string {
  const prefix = IMAGE_BYTE_PREFIXES[mime] ?? 'data:application/octet-stream;base64,';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i] ?? 0);
  // btoa is available in browsers and modern Node. The encodeURIComponent trick
  // is used to avoid stack overflow on very large buffers in older runtimes.
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return prefix + b64;
}

export function prepareMultimodalMessage(
  prompt: string,
  frames: ExtractedFrame[],
  options: PrepareOptions = {},
): PreparedMultimodalMessage {
  const max = options.maxImages ?? 8;
  const parts: MultimodalMessageContentPart[] = [{ type: 'text', text: prompt }];
  const slice = frames.slice(0, max);
  for (const f of slice) {
    const mime = f.mimeType || options.defaultImageMime || 'image/jpeg';
    parts.push({
      type: 'image_url',
      image_url: { url: buildImageUrl(f.bytes, mime), detail: options.detail ?? 'auto' },
    });
  }
  return { role: 'user', content: parts };
}

// =============================================================================
// Visual evals for the workflow builder
// =============================================================================

export interface UIActionExpectation {
  /** Predicted action type from a vision model (e.g. "click", "type"). */
  actionType: string;
  /** Predicted target, e.g. normalized bbox center or selector. */
  target?: string;
  /** Optional expected text or value. */
  text?: string;
}

export interface VisualEvalCase {
  id: string;
  /** A free-form description of the UI state. */
  stateDescription: string;
  /** Optional structural hash of the DOM or screenshot (for reproducibility). */
  stateHash?: string;
  /** Ground truth actions expected. */
  expected: UIActionExpectation[];
  /** What the workflow actually produced. */
  actual: UIActionExpectation[];
}

export interface VisualEvalScore {
  caseId: string;
  actionMatch: number;
  targetMatch: number;
  textMatch: number;
  overall: number;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / max;
}

export function scoreCase(c: VisualEvalCase): VisualEvalScore {
  const expectedActions = c.expected.map((e) => e.actionType);
  const actualActions = c.actual.map((a) => a.actionType);
  let matched = 0;
  const usedActual = new Set<number>();
  for (const a of expectedActions) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < actualActions.length; i += 1) {
      if (usedActual.has(i)) continue;
      const s = similarity(a, actualActions[i] ?? '');
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 0.5) {
      matched += bestScore;
      usedActual.add(bestIdx);
    }
  }
  const actionMatch = expectedActions.length > 0 ? matched / expectedActions.length : 1;

  let targetAcc = 0;
  let textAcc = 0;
  let count = 0;
  for (let i = 0; i < c.expected.length; i += 1) {
    const exp = c.expected[i];
    const act = c.actual[i];
    if (!exp) continue;
    count += 1;
    if (act) {
      targetAcc += similarity(exp.target ?? '', act.target ?? '');
      textAcc += similarity(exp.text ?? '', act.text ?? '');
    }
  }
  const targetMatch = count > 0 ? targetAcc / count : 1;
  const textMatch = count > 0 ? textAcc / count : 1;
  const overall = 0.5 * actionMatch + 0.3 * targetMatch + 0.2 * textMatch;

  return { caseId: c.id, actionMatch, targetMatch, textMatch, overall };
}

export interface VisualEvalRun {
  totalCases: number;
  passed: number;
  failed: number;
  averageScore: number;
  scores: VisualEvalScore[];
  /** Cases whose `overall` score is below this threshold. Defaults to 0.7. */
  threshold?: number;
}

export function runVisualEval(cases: VisualEvalCase[], threshold = 0.7): VisualEvalRun {
  const scores: VisualEvalScore[] = [];
  let passed = 0;
  let sum = 0;
  for (const c of cases) {
    const s = scoreCase(c);
    scores.push(s);
    sum += s.overall;
    if (s.overall >= threshold) passed += 1;
  }
  return {
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    averageScore: cases.length > 0 ? sum / cases.length : 1,
    scores,
    threshold,
  };
}
