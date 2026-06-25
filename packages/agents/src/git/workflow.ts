// ==============================================================================
// GHITA CODING AGENT - Phase 8: Git Safe-Points & Safe-Rollback Loop
// ==============================================================================
// Tự động tạo commit ẩn nháp "ghita-temp-safepoint" trước khi sửa nhiều file
// và tự động rollback (git reset/git clean) nếu biên dịch hoặc kiểm thử bị lỗi đỏ.
// Tham chiếu: Aider + Claude Code (git)
// ==============================================================================

import { execFileSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import fs from 'fs';
import * as path from 'path';
import type { AgentMiddleware, MiddlewareContext } from '../middleware/types.js';

/**
 * Parse a shell-style command string into argv array for execFile.
 * Hỗ trợ simple quoted segments; KHÔNG hỗ trợ command substitution/redirects.
 */
function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if ((ch === ' ' || ch === '\t') && cur) {
      tokens.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/**
 * Escape một string để dùng an toàn trong shell argv (single-quote escape).
 */
function shellEscape(value: string): string {
  return `'${  value.replace(/'/g, "'\\''")  }'`;
}

// ==============================================================================
// GitSafePointManager — Quản lý điểm neo và khôi phục an toàn (Tác vụ 1, 2, 3, 4, 5, 6, 7, 8, 10)
// ==============================================================================

export class GitSafePointManager {
  private static readonly LOCK_TIMEOUT_MS = 10000; // 10 giây

  /**
   * Giải phóng tệp tin .git/index.lock nếu đã tồn tại quá lâu (Tác vụ 8)
   */
  public static checkAndReleaseLock(cwd: string): void {
    const lockPath = path.join(cwd, '.git', 'index.lock');
    try {
      if (fs.existsSync(lockPath)) {
        const stats = fs.statSync(lockPath);
        const age = Date.now() - stats.mtimeMs;
        if (age > this.LOCK_TIMEOUT_MS) {
          fs.unlinkSync(lockPath);
          console.warn(`[GitSafePoint] Auto-deleted orphaned Git lock file: ${lockPath}`);
        }
      }
    } catch {
      // Bỏ qua lỗi truy cập file
    }
  }

  /**
   * Chạy lệnh shell với cơ chế retry luỹ tiến phòng index.lock (Tác vụ 5)
   */
  public static execGit(cmd: string, cwd: string, retries = 5, delay = 100): string {
    const argv = tokenizeCommand(cmd);
    const program = argv[0];
    if (program === undefined) {
      throw new Error('Empty git command');
    }
    const args = argv.slice(1);
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < retries; attempt++) {
      this.checkAndReleaseLock(cwd);
      try {
        return execFileSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('lock')) {
          const backoff = delay * Math.pow(2, attempt);
          // Dùng sleep() thay vì spawn node subprocess
          sleep(backoff);
          continue;
        }
        throw lastError;
      }
    }
    throw new Error(
      `Git command failed after ${retries} attempts: ${cmd}. Error: ${lastError?.message}`,
    );
  }

  /**
   * Tạo điểm neo an toàn ẩn nháp ghita-temp-safepoint (Tác vụ 2, 3, 10)
   */
  public static createSafePoint(cwd: string): boolean {
    try {
      // 1. Kiểm tra xem thư mục có nằm trong Git repo không
      try {
        this.execGit('git rev-parse --is-inside-work-tree', cwd);
      } catch {
        return false; // Không phải Git repo, bỏ qua bảo vệ
      }

      // 2. Kiểm tra xem có thay đổi nào chưa staged/untracked không
      const status = this.execGit('git status --porcelain', cwd).trim();
      if (!status) {
        return false; // Không có thay đổi nào, không cần tạo safe-point
      }

      // 3. Stash hoặc tạo commit nháp. Ở đây ta dùng commit nháp ẩn ghita-temp-safepoint
      this.execGit('git add -A', cwd);
      this.execGit(`git commit -m ${shellEscape('ghita-temp-safepoint')} --no-verify`, cwd);

      // Ghi log tĩnh hành vi tạo điểm neo
      this.logGitAction(cwd, 'CREATE_SAFEPOINT', 'Created temporary safepoint successfully');
      return true;
    } catch (err: unknown) {
      console.warn(
        `[GitSafePoint] Failed to create safe-point: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Khôi phục (rollback) mã nguồn về trạng thái an toàn gần nhất (Tác vụ 4, 6, 7)
   */
  public static rollback(cwd: string): boolean {
    try {
      // 1. Kiểm tra Git worktree
      try {
        this.execGit('git rev-parse --is-inside-work-tree', cwd);
      } catch {
        return false;
      }

      // 2. Xem commit gần nhất có phải là ghita-temp-safepoint không
      const lastCommitMsg = this.execGit('git log -1 --pretty=%s', cwd).trim();

      if (lastCommitMsg === 'ghita-temp-safepoint') {
        // Thực hiện rollback cứng hủy bỏ commit nháp và dọn dẹp các tệp tin mới phát sinh
        this.execGit('git reset --hard HEAD~1', cwd);
        this.execGit('git clean -fd', cwd);
        this.logGitAction(cwd, 'ROLLBACK', 'Hard rollbacked ghita-temp-safepoint successfully');
        return true;
      } else {
        // Nếu không có commit nháp, chỉ checkout dọn dẹp thay đổi chưa staged
        this.execGit('git reset --hard HEAD', cwd);
        this.execGit('git clean -fd', cwd);
        this.logGitAction(cwd, 'ROLLBACK', 'Cleaned working directory (no safepoint found)');
        return true;
      }
    } catch (err: unknown) {
      console.error(
        `[GitSafePoint] Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Lưu log lịch sử Git actions xuống file log tĩnh (Tác vụ 7)
   */
  private static logGitAction(cwd: string, action: string, detail: string): void {
    try {
      const logDir = path.join(cwd, '.ghita');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'git-rollback.log');
      const timestamp = new Date().toISOString();
      const logMsg = `[${timestamp}] [${action}] ${detail}\n`;
      fs.appendFileSync(logPath, logMsg, 'utf8');
    } catch {
      // Tránh crash nếu ghi log lỗi
    }
  }
}

// ==============================================================================
// GitSafePointMiddleware — Middleware Agent chèn rào chắn preTool/postTool
// ==============================================================================

export class GitSafePointMiddleware implements AgentMiddleware {
  readonly name = 'GitSafePointMiddleware';
  readonly priority = 5; // Độ ưu tiên cao để chạy sớm trước AST-Lock

  private activeSafepoints = new Set<string>();

  /**
   * Pre-tool hook: Tự động kích hoạt tạo Safe-Point trước khi sửa file
   */
  async preTool(
    toolName: string,
    _args: Record<string, unknown>,
    _context: MiddlewareContext,
  ): Promise<{ proceed: boolean; reason?: string } | void> {
    const writeTools = [
      'writeFile',
      'write_to_file',
      'replace_file_content',
      'multi_replace_file_content',
    ];
    if (!writeTools.includes(toolName)) return;

    const cwd = process.cwd();
    if (!this.activeSafepoints.has(cwd)) {
      const created = GitSafePointManager.createSafePoint(cwd);
      if (created) {
        this.activeSafepoints.add(cwd);
      }
    }
    return { proceed: true };
  }

  /**
   * Post-tool hook: Tự động rollback khi phát hiện lệnh run_command bị lỗi đỏ
   */
  async postTool(
    toolName: string,
    result: string,
    _context: MiddlewareContext,
  ): Promise<{ modifiedResult?: string } | void> {
    // Chỉ bắt lỗi từ các tool thực thi lệnh terminal (kiểm thử, build)
    if (toolName !== 'run_command' && toolName !== 'runCommand') return;

    // Các cụm từ chỉ lỗi đỏ kiểm thử hoặc lỗi biên dịch sập hệ thống
    const errorKeywords = [
      'test failed',
      'tests failed',
      'compile error',
      'compilation failed',
      'vitest failed',
      'build failed',
      'typecheck failed',
      'exit code 1',
      'exit code 2',
      'exit status 1',
      'exit status 2',
      'failed with exit code',
      'npm err!',
      'command failed',
    ];

    const lowerResult = result.toLowerCase();
    const hasError = errorKeywords.some((keyword) => lowerResult.includes(keyword));

    if (hasError) {
      const cwd = process.cwd();
      const rolledBack = GitSafePointManager.rollback(cwd);
      this.activeSafepoints.delete(cwd); // Xoá trạng thái safe-point active của thư mục

      if (rolledBack) {
        return {
          modifiedResult: `[GIT SAFE-ROLLBACK GATES ACTIVATED]\nBiên dịch hoặc kiểm thử bị lỗi đỏ. Hệ thống tự động kích hoạt chế độ khôi phục (Hard Rollback) đưa mã nguồn về trạng thái an toàn gần nhất để phòng tránh hỏng hóc.\nKết quả lỗi terminal gốc:\n${result}`,
        };
      }
    }
  }

  /**
   * Khôi phục an toàn khi có ngoại lệ ném ra trong quá trình chạy
   */
  async onError(error: Error, _context: MiddlewareContext): Promise<{ retry?: boolean } | void> {
    const cwd = process.cwd();
    GitSafePointManager.rollback(cwd);
    this.activeSafepoints.delete(cwd);
    console.warn(`[GitSafePointMiddleware] Auto-rollback triggered by exception: ${error.message}`);
  }
}
