// Merge partial STT results into a final transcript

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   segment array length is checked before each index access below */

import type { SttResult } from './types.js';

/** A partial transcript segment with timing metadata */
export interface PartialSegment {
  text: string;
  confidence: number;
  startMs: number;
  endMs: number;
  isFinal: boolean;
}

/**
 * Merges a stream of partial STT results into a coherent final transcript.
 *
 * Streaming STT engines (Whisper, Deepgram) emit overlapping partial results
 * as the user speaks. This class deduplicates overlapping words, smooths
 * confidence scores, and produces a final merged transcript when the utterance
 * ends.
 */
export class TranscriptMerger {
  private segments: PartialSegment[] = [];
  private lastEndMs = 0;
  /** Minimum gap (ms) to consider a new utterance */
  private gapThresholdMs: number;

  constructor(gapThresholdMs = 1500) {
    this.gapThresholdMs = gapThresholdMs;
  }

  /** Add a partial STT result. Returns true if a new utterance was detected. */
  addPartial(result: SttResult): boolean {
    const segment: PartialSegment = {
      text: result.text,
      confidence: result.confidence,
      startMs: this.lastEndMs,
      endMs: this.lastEndMs + result.durationMs,
      isFinal: false,
    };

    // Detect gap (new utterance)
    const isNewUtterance = this.segments.length > 0 && segment.startMs - this.lastEndMs > this.gapThresholdMs;
    if (isNewUtterance) {
      this.segments = [];
    }

    this.segments.push(segment);
    this.lastEndMs = segment.endMs;
    return isNewUtterance;
  }

  /** Mark the last segment as final. */
  markFinal(): void {
    if (this.segments.length > 0) {
      this.segments[this.segments.length - 1]!.isFinal = true;
    }
  }

  /**
   * Merge all partial segments into a single transcript string.
   * Uses a simple longest-common-prefix deduplication strategy to handle
   * overlapping partial results from streaming STT.
   */
  merge(): string {
    if (this.segments.length === 0) return '';
    if (this.segments.length === 1) return this.segments[0]!.text.trim();

    // Take only final segments for stable output
    const finals = this.segments.filter((s) => s.isFinal);
    if (finals.length > 0) {
      return finals.map((s) => s.text.trim()).filter(Boolean).join(' ');
    }

    // If no finals, merge partials by deduplicating overlapping text
    let merged = this.segments[0]!.text.trim();
    for (let i = 1; i < this.segments.length; i++) {
      const next = this.segments[i]!.text.trim();
      merged = this.mergeTwoStrings(merged, next);
    }
    return merged;
  }

  /** Get the average confidence across all segments. */
  averageConfidence(): number {
    if (this.segments.length === 0) return 0;
    const sum = this.segments.reduce((acc, s) => acc + s.confidence, 0);
    return sum / this.segments.length;
  }

  /** Get the total duration of all segments in ms. */
  totalDurationMs(): number {
    if (this.segments.length === 0) return 0;
    return this.segments[this.segments.length - 1]!.endMs - this.segments[0]!.startMs;
  }

  /** Get all segments. */
  getSegments(): ReadonlyArray<PartialSegment> {
    return this.segments;
  }

  /** Reset the merger for a new utterance. */
  reset(): void {
    this.segments = [];
    this.lastEndMs = 0;
  }

  /**
   * Merge two overlapping strings by finding the longest suffix of `a`
   * that matches a prefix of `b`.
   */
  private mergeTwoStrings(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;

    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);

    // Find longest overlap: suffix of a matching prefix of b
    let maxOverlap = 0;
    const limit = Math.min(aWords.length, bWords.length);
    for (let i = 1; i <= limit; i++) {
      const aSuffix = aWords.slice(aWords.length - i).join(' ').toLowerCase();
      const bPrefix = bWords.slice(0, i).join(' ').toLowerCase();
      if (aSuffix === bPrefix) {
        maxOverlap = i;
      }
    }

    if (maxOverlap > 0) {
      const nonOverlapping = bWords.slice(maxOverlap);
      return nonOverlapping.length > 0
        ? `${a} ${nonOverlapping.join(' ')}`
        : a;
    }
    return `${a} ${b}`;
  }
}
