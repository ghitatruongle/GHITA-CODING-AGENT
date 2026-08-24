import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface HeadlessSearchOptions {
  
  range?: number;
  
  balanceBrackets?: boolean;
  
  removeComments?: boolean;
  
  maxFileSize?: number;
  
  excludedExtensions?: string[];
}

export interface HeadlessSearchResult {
  filePath: string;
  keyword: string;
  found: boolean;
  startLine: number;
  endLine: number;
  originalLinesCount: number;
  compressedSize: number;
  uncompressedSize: number;
  content: string;
}

export class HeadlessSearchScanner {
  private range: number;
  private balanceBrackets: boolean;
  private removeComments: boolean;
  private maxFileSize: number;
  private excludedExtensions: string[];
  private compressionMetrics: { totalOriginal: number; totalCompressed: number; count: number } = {
    totalOriginal: 0,
    totalCompressed: 0,
    count: 0,
  };

  constructor(options: HeadlessSearchOptions = {}) {
    this.range = options.range ?? 20;
    this.balanceBrackets = options.balanceBrackets ?? true;
    this.removeComments = options.removeComments ?? true;
    this.maxFileSize = options.maxFileSize ?? 1024 * 1024; // 1MB
    this.excludedExtensions = options.excludedExtensions ?? [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
      '.log',
      '.exe',
      '.dll',
      '.so',
      '.dylib',
      '.db',
      '.sqlite',
      '.sqlite3',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
      '.mp3',
      '.mp4',
      '.avi',
      '.mov',
    ];
  }

  public getDefaultOptions(): HeadlessSearchOptions {
    return {
      range: this.range,
      balanceBrackets: this.balanceBrackets,
      removeComments: this.removeComments,
      maxFileSize: this.maxFileSize,
      excludedExtensions: [...this.excludedExtensions],
    };
  }

  public getExcludedExtensions(): string[] {
    return [...this.excludedExtensions];
  }

  public isExcludedExtension(ext: string): boolean {
    return this.excludedExtensions.includes(ext.toLowerCase());
  }

  public getCompressionMetrics(): {
    totalOriginal: number;
    totalCompressed: number;
    count: number;
    compressionRatio: number;
  } {
    const ratio =
      this.compressionMetrics.totalOriginal > 0
        ? this.compressionMetrics.totalCompressed / this.compressionMetrics.totalOriginal
        : 0;
    return {
      ...this.compressionMetrics,
      compressionRatio: Math.round(ratio * 100) / 100,
    };
  }

  public async searchFile(filePath: string, keyword: string): Promise<HeadlessSearchResult> {
    const result: HeadlessSearchResult = {
      filePath,
      keyword,
      found: false,
      startLine: 0,
      endLine: 0,
      originalLinesCount: 0,
      compressedSize: 0,
      uncompressedSize: 0,
      content: '',
    };

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    if (stats.size > this.maxFileSize) {
      throw new Error(`File size (${stats.size} bytes) exceeds limit of ${this.maxFileSize} bytes`);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (this.excludedExtensions.includes(ext)) {
      throw new Error(`File type ${ext} is excluded from headless search`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    result.originalLinesCount = lines.length;

    const lowerKeyword = keyword.toLowerCase();
    let keywordLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.toLowerCase().includes(lowerKeyword)) {
        keywordLineIdx = i;
        break;
      }
    }

    if (keywordLineIdx === -1) {
      return result; // found = false
    }

    result.found = true;

    let startIdx = Math.max(0, keywordLineIdx - this.range);
    let endIdx = Math.min(lines.length - 1, keywordLineIdx + this.range);

    if (this.balanceBrackets) {
      const balancedRange = this.doBalanceBrackets(lines, startIdx, endIdx);
      startIdx = balancedRange.start;
      endIdx = balancedRange.end;
    }

    result.startLine = startIdx + 1; // 1-based index
    result.endLine = endIdx + 1;

    let snippet = lines.slice(startIdx, endIdx + 1).join('\n');

    if (this.removeComments) {
      snippet = this.removeCommentsAndHeaders(snippet);
    }

    result.content = snippet;
    result.uncompressedSize = Buffer.byteLength(snippet, 'utf-8');

    const compressed = this.compressContext(snippet);
    result.compressedSize = compressed.length;

    // Update compression metrics
    this.compressionMetrics.totalOriginal += result.uncompressedSize;
    this.compressionMetrics.totalCompressed += result.compressedSize;
    this.compressionMetrics.count++;

    return result;
  }

  private doBalanceBrackets(
    lines: string[],
    start: number,
    end: number,
  ): { start: number; end: number } {
    let currentStart = start;
    let currentEnd = end;
    const maxExpansion = this.range * 2; 

    const getBracketBalance = (s: number, e: number): number => {
      let balance = 0;
      for (let i = s; i <= e; i++) {
        const line = lines[i];
        if (line) {
          for (let j = 0; j < line.length; j++) {
            if (line[j] === '{') balance++;
            else if (line[j] === '}') balance--;
          }
        }
      }
      return balance;
    };

    let balance = getBracketBalance(currentStart, currentEnd);

    let iterations = 0;
    while (balance !== 0 && iterations < maxExpansion) {
      iterations++;

      if (balance > 0) {
        
        if (currentEnd < lines.length - 1) {
          currentEnd++;
          const addedLine = lines[currentEnd];
          if (addedLine) {
            for (let j = 0; j < addedLine.length; j++) {
              if (addedLine[j] === '{') balance++;
              else if (addedLine[j] === '}') balance--;
            }
          }
        } else {
          
          if (currentStart > 0) {
            currentStart--;
            const addedLine = lines[currentStart];
            if (addedLine) {
              for (let j = 0; j < addedLine.length; j++) {
                if (addedLine[j] === '{') balance++;
                else if (addedLine[j] === '}') balance--;
              }
            }
          } else {
            break; 
          }
        }
      } else {
        
        if (currentStart > 0) {
          currentStart--;
          const addedLine = lines[currentStart];
          if (addedLine) {
            for (let j = 0; j < addedLine.length; j++) {
              if (addedLine[j] === '{') balance++;
              else if (addedLine[j] === '}') balance--;
            }
          }
        } else {
          
          if (currentEnd < lines.length - 1) {
            currentEnd++;
            const addedLine = lines[currentEnd];
            if (addedLine) {
              for (let j = 0; j < addedLine.length; j++) {
                if (addedLine[j] === '{') balance++;
                else if (addedLine[j] === '}') balance--;
              }
            }
          } else {
            break; 
          }
        }
      }
    }

    return { start: currentStart, end: currentEnd };
  }

  public removeCommentsAndHeaders(code: string): string {
    
    const cleaned = code.replace(/\/\*[\s\S]*?\*\//g, '');

    const lines = cleaned.split(/\r?\n/);
    const processedLines = lines.map((line) => {
      
      const parts = line.split('//');
      if (parts.length <= 1) return line;

      const firstPart = parts[0];
      if (firstPart === undefined) return line;

      const matchUrl = /https?:$|file:$/i.test(firstPart);
      if (matchUrl) {
        
        return line;
      }

      return firstPart.trimEnd();
    });

    const finalLines: string[] = [];
    let isHeaderSection = true;

    for (const line of processedLines) {
      const trimmed = line.trim();

      if (!trimmed) {
        if (!isHeaderSection) finalLines.push(line);
        continue;
      }

      const isImport =
        trimmed.startsWith('import ') ||
        trimmed.startsWith('export * from') ||
        trimmed.startsWith('import type ') ||
        /const\s+.*\s+=\s+require\(/.test(trimmed) ||
        /let\s+.*\s+=\s+require\(/.test(trimmed) ||
        /var\s+.*\s+=\s+require\(/.test(trimmed);

      if (isHeaderSection && isImport) {
        
        continue;
      }

      isHeaderSection = false;
      finalLines.push(line);
    }

    return finalLines.join('\n').trim();
  }

  public compressContext(text: string): Buffer {
    return zlib.gzipSync(Buffer.from(text, 'utf-8'));
  }

  public decompressContext(compressed: Buffer): string {
    return zlib.gunzipSync(compressed).toString('utf-8');
  }
}
