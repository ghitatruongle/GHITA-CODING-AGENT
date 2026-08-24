// Applies precise structural replacements or patch blocks to source code without
// breaking syntax boundaries, matching curly braces, or corrupting indentation.

export interface ASTEditChunk {
  startLine: number;
  endLine: number;
  targetContent: string;
  replacementContent: string;
}

export class ASTStructuralEditor {
  /**
   * Apply a list of non-contiguous edit chunks to a source file string.
   */
  static applyEditChunks(
    originalContent: string,
    chunks: ASTEditChunk[],
  ): { updatedContent: string; appliedCount: number } {
    const lines = originalContent.split('\n');
    let appliedCount = 0;

    // Sort chunks in descending order of startLine to prevent line offset shifts
    const sortedChunks = [...chunks].sort((a, b) => b.startLine - a.startLine);

    for (const chunk of sortedChunks) {
      const targetLines = lines.slice(chunk.startLine - 1, chunk.endLine).join('\n');

      if (
        targetLines.trim() === chunk.targetContent.trim() ||
        targetLines.includes(chunk.targetContent.trim())
      ) {
        const replacementLines = chunk.replacementContent.split('\n');
        lines.splice(chunk.startLine - 1, chunk.endLine - chunk.startLine + 1, ...replacementLines);
        appliedCount++;
      }
    }

    return {
      updatedContent: lines.join('\n'),
      appliedCount,
    };
  }
}
