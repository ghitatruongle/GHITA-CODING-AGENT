// ==============================================================================
// GHITA CODING AGENT - Reasoning & Thinking Block Extraction
// ==============================================================================

export interface ExtractedReasoning {
  content: string; // Text content after stripping <think> blocks
  reasoning: string; // The extracted thinking block content
}

/**
 * Statically extracts reasoning/thinking blocks enclosed in <think>...</think> tags.
 * Handles unclosed thinking blocks gracefully.
 */
export function extractReasoning(text: string): ExtractedReasoning {
  if (!text) {
    return { content: '', reasoning: '' };
  }

  let content = text;
  let reasoning = '';

  // Match all <think>...</think> tags case-insensitively
  const regex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  const thinkingBlocks: string[] = [];

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      thinkingBlocks.push(match[1].trim());
    }
  }

  if (thinkingBlocks.length > 0) {
    reasoning = thinkingBlocks.join('\n\n');
    content = text.replace(regex, '').trim();
  } else {
    // Check if there is an unclosed <think> block at the end (common if model is cut off)
    const openIndex = text.toLowerCase().lastIndexOf('<think>');
    const closeIndex = text.toLowerCase().lastIndexOf('</think>');
    if (openIndex !== -1 && (closeIndex === -1 || closeIndex < openIndex)) {
      reasoning = text.substring(openIndex + 7).trim();
      content = text.substring(0, openIndex).trim();
    }
  }

  return { content, reasoning };
}

export interface ReasoningStreamResult {
  text: string; // The original chunk text slice
  contentSlice: string; // Flushed standard content slice
  reasoningSlice: string; // Flushed thinking reasoning slice
  isThinking: boolean; // Current state of thinking
}

/**
 * Stateful parser to split content and reasoning streams in real-time.
 * Handles partial and fragmented tags (e.g. "<th", "</t") across chunk borders safely.
 */
export class ReasoningStreamExtractor {
  private isThinking = false;
  private buffer = '';

  /**
   * Processes an incoming text chunk and separates content from reasoning.
   */
  processChunk(text: string): ReasoningStreamResult {
    this.buffer += text;
    let contentSlice = '';
    let reasoningSlice = '';

    while (this.buffer.length > 0) {
      if (!this.isThinking) {
        const thinkTagIdx = this.buffer.toLowerCase().indexOf('<think>');
        if (thinkTagIdx !== -1) {
          contentSlice += this.buffer.substring(0, thinkTagIdx);
          this.isThinking = true;
          this.buffer = this.buffer.substring(thinkTagIdx + 7);
        } else {
          // If the buffer ends with a partial "<think>" tag, hold it
          const lastLessThan = this.buffer.lastIndexOf('<');
          if (
            lastLessThan !== -1 &&
            '<think>'.startsWith(this.buffer.substring(lastLessThan).toLowerCase())
          ) {
            contentSlice += this.buffer.substring(0, lastLessThan);
            this.buffer = this.buffer.substring(lastLessThan);
            break;
          } else {
            contentSlice += this.buffer;
            this.buffer = '';
          }
        }
      } else {
        const closeTagIdx = this.buffer.toLowerCase().indexOf('</think>');
        if (closeTagIdx !== -1) {
          reasoningSlice += this.buffer.substring(0, closeTagIdx);
          this.isThinking = false;
          this.buffer = this.buffer.substring(closeTagIdx + 8);
        } else {
          // If the buffer ends with a partial "</think>" tag, hold it
          const lastLessThan = this.buffer.lastIndexOf('<');
          if (
            lastLessThan !== -1 &&
            '</think>'.startsWith(this.buffer.substring(lastLessThan).toLowerCase())
          ) {
            reasoningSlice += this.buffer.substring(0, lastLessThan);
            this.buffer = this.buffer.substring(lastLessThan);
            break;
          } else {
            reasoningSlice += this.buffer;
            this.buffer = '';
          }
        }
      }
    }

    return {
      text,
      contentSlice,
      reasoningSlice,
      isThinking: this.isThinking,
    };
  }

  /**
   * Returns whether currently in thinking mode.
   */
  getThinkingState(): boolean {
    return this.isThinking;
  }

  /**
   * Flushes any remaining buffer as content or reasoning.
   */
  flush(): { contentSlice: string; reasoningSlice: string } {
    const contentSlice = this.isThinking ? '' : this.buffer;
    const reasoningSlice = this.isThinking ? this.buffer : '';
    this.buffer = '';
    return { contentSlice, reasoningSlice };
  }
}
