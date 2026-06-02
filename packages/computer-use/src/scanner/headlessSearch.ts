// =============================================================================
// GHITA CODING AGENT - Phase 14: Headless Search & Token Context Compactor
// Trích xuất dòng code hẹp, cân bằng dấu ngoặc và nén ngữ cảnh tối đa.
// =============================================================================

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface HeadlessSearchOptions {
  /** Số lượng dòng bao quanh từ khóa (mặc định là 20 dòng) */
  range?: number;
  /** Tự động cân bằng ngoặc nhọn { } (mặc định là true) */
  balanceBrackets?: boolean;
  /** Tự động loại bỏ comment và import/require headers (mặc định là true) */
  removeComments?: boolean;
  /** Kích thước file tối đa chấp nhận quét (mặc định là 1MB) */
  maxFileSize?: number;
  /** Danh sách các phần mở rộng bị loại trừ (nhị phân, log, media) */
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
      '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz',
      '.log', '.exe', '.dll', '.so', '.dylib', '.db', '.sqlite', '.sqlite3',
      '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov'
    ];
  }

  /**
   * Lấy các tùy chọn mặc định của scanner
   */
  public getDefaultOptions(): HeadlessSearchOptions {
    return {
      range: this.range,
      balanceBrackets: this.balanceBrackets,
      removeComments: this.removeComments,
      maxFileSize: this.maxFileSize,
      excludedExtensions: [...this.excludedExtensions],
    };
  }

  /**
   * Lấy danh sách các extension bị loại trừ
   */
  public getExcludedExtensions(): string[] {
    return [...this.excludedExtensions];
  }

  /**
   * Kiểm tra một extension có bị loại trừ hay không
   */
  public isExcludedExtension(ext: string): boolean {
    return this.excludedExtensions.includes(ext.toLowerCase());
  }

  /**
   * Lấy metrics nén ngữ cảnh
   */
  public getCompressionMetrics(): {
    totalOriginal: number;
    totalCompressed: number;
    count: number;
    compressionRatio: number;
  } {
    const ratio = this.compressionMetrics.totalOriginal > 0
      ? this.compressionMetrics.totalCompressed / this.compressionMetrics.totalOriginal
      : 0;
    return {
      ...this.compressionMetrics,
      compressionRatio: Math.round(ratio * 100) / 100,
    };
  }

  /**
   * Quét tệp tin và trích xuất dải dòng code hẹp quanh từ khóa
   */
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
      content: ''
    };

    // 1. Kiểm tra file tồn tại và là file thông thường
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // 2. Kiểm tra dung lượng file tối đa
    if (stats.size > this.maxFileSize) {
      throw new Error(`File size (${stats.size} bytes) exceeds limit of ${this.maxFileSize} bytes`);
    }

    // 3. Kiểm tra phần mở rộng tệp tin loại trừ
    const ext = path.extname(filePath).toLowerCase();
    if (this.excludedExtensions.includes(ext)) {
      throw new Error(`File type ${ext} is excluded from headless search`);
    }

    // 4. Đọc nội dung tệp tin
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    result.originalLinesCount = lines.length;

    // 5. Tìm kiếm dòng chứa từ khóa đầu tiên (case-insensitive)
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

    // 6. Tính toán dải dòng ban đầu
    let startIdx = Math.max(0, keywordLineIdx - this.range);
    let endIdx = Math.min(lines.length - 1, keywordLineIdx + this.range);

    // 7. Áp dụng Bracket Balancer bằng Sliding Window nếu được kích hoạt
    if (this.balanceBrackets) {
      const balancedRange = this.doBalanceBrackets(lines, startIdx, endIdx);
      startIdx = balancedRange.start;
      endIdx = balancedRange.end;
    }

    result.startLine = startIdx + 1; // 1-based index
    result.endLine = endIdx + 1;

    // 8. Trích xuất code snippet thô
    let snippet = lines.slice(startIdx, endIdx + 1).join('\n');

    // 9. Loại bỏ comments và import/require headers nếu được cấu hình
    if (this.removeComments) {
      snippet = this.removeCommentsAndHeaders(snippet);
    }

    result.content = snippet;
    result.uncompressedSize = Buffer.byteLength(snippet, 'utf-8');

    // 10. Nén ngữ cảnh bằng zlib gzip
    const compressed = this.compressContext(snippet);
    result.compressedSize = compressed.length;

    // Update compression metrics
    this.compressionMetrics.totalOriginal += result.uncompressedSize;
    this.compressionMetrics.totalCompressed += result.compressedSize;
    this.compressionMetrics.count++;

    return result;
  }

  /**
   * Thuật toán Sliding Window Bracket Balancer cân bằng dấu ngoặc { }
   */
  private doBalanceBrackets(lines: string[], start: number, end: number): { start: number; end: number } {
    let currentStart = start;
    let currentEnd = end;
    const maxExpansion = this.range * 2; // Giới hạn mở rộng tối đa để tránh scan cả tệp

    // Hàm đếm số lượng { và } trong dải dòng hiện tại
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

    // Mở rộng lặp cho đến khi balance = 0 hoặc vượt quá giới hạn
    let iterations = 0;
    while (balance !== 0 && iterations < maxExpansion) {
      iterations++;
      
      if (balance > 0) {
        // Nhiều dấu mở { hơn đóng } -> mở rộng xuống dưới để tìm }
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
          // Hit EOF, cố gắng mở rộng lên trên làm đối trọng nếu có thể
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
            break; // Hết file
          }
        }
      } else {
        // Nhiều dấu đóng } hơn mở { -> mở rộng lên trên để tìm {
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
          // Hit BOF, cố gắng mở rộng xuống dưới làm đối trọng nếu có thể
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
            break; // Hết file
          }
        }
      }
    }

    return { start: currentStart, end: currentEnd };
  }

  /**
   * Loại bỏ comments và import headers
   */
  public removeCommentsAndHeaders(code: string): string {
    // 1. Loại bỏ các comment đa dòng /* ... */
    const cleaned = code.replace(/\/\*[\s\S]*?\*\//g, '');

    // 2. Loại bỏ comment đơn dòng // ... nhưng giữ lại URL (http://, https://, file://)
    const lines = cleaned.split(/\r?\n/);
    const processedLines = lines.map(line => {
      // Phân tách bởi //
      const parts = line.split('//');
      if (parts.length <= 1) return line;

      // Kiểm tra xem // có phải một phần của URL hay không
      const firstPart = parts[0];
      if (firstPart === undefined) return line;
      
      const matchUrl = /https?:$|file:$/i.test(firstPart);
      if (matchUrl) {
        // Giữ lại URL
        return line;
      }

      // Xóa phần comment phía sau
      return firstPart.trimEnd();
    });

    // 3. Loại bỏ import / require headers ở đầu tệp tin
    const finalLines: string[] = [];
    let isHeaderSection = true;

    for (const line of processedLines) {
      const trimmed = line.trim();
      
      // Nếu dòng trống, bỏ qua hoặc giữ lại tùy vị trí
      if (!trimmed) {
        if (!isHeaderSection) finalLines.push(line);
        continue;
      }

      // Nhận diện dòng import hoặc require
      const isImport = trimmed.startsWith('import ') || 
                       trimmed.startsWith('export * from') ||
                       trimmed.startsWith('import type ') ||
                       /const\s+.*\s+=\s+require\(/.test(trimmed) ||
                       /let\s+.*\s+=\s+require\(/.test(trimmed) ||
                       /var\s+.*\s+=\s+require\(/.test(trimmed);

      if (isHeaderSection && isImport) {
        // Bỏ qua dòng import ở đầu
        continue;
      }

      // Kết thúc Header section khi gặp bất kỳ dòng logic nào khác
      isHeaderSection = false;
      finalLines.push(line);
    }

    return finalLines.join('\n').trim();
  }

  /**
   * Nén ngữ cảnh bằng zlib Gzip Sync
   */
  public compressContext(text: string): Buffer {
    return zlib.gzipSync(Buffer.from(text, 'utf-8'));
  }

  /**
   * Giải nén ngữ cảnh bằng zlib Gunzip Sync
   */
  public decompressContext(compressed: Buffer): string {
    return zlib.gunzipSync(compressed).toString('utf-8');
  }
}
