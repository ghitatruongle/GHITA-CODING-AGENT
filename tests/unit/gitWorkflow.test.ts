import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Mock child_process at top level for ESM compatibility
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    execSync: vi.fn(),
  };
});

import { GitSafePointManager, GitSafePointMiddleware } from '../../packages/agents/src/index.js';

describe('Phase 8: Git Safe-Points & Rollback Unit Tests', () => {
  const mockCwd = path.resolve('mock-project');

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(execSync).mockReset();
  });

  describe('1. GitSafePointManager - Git Lock File Cleanup', () => {
    it('should delete index.lock file if it has existed for more than 10 seconds', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: Date.now() - 15000 } as any);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      GitSafePointManager.checkAndReleaseLock(mockCwd);

      expect(existsSpy).toHaveBeenCalledWith(path.join(mockCwd, '.git', 'index.lock'));
      expect(unlinkSpy).toHaveBeenCalled();
    });

    it('should NOT delete index.lock file if it has existed for less than 10 seconds', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: Date.now() - 2000 } as any);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      GitSafePointManager.checkAndReleaseLock(mockCwd);

      expect(existsSpy).toHaveBeenCalled();
      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });

  describe('1b. GitSafePointManager - execGit retry and edge cases', () => {
    it('should retry execGit when index.lock error occurs and eventually succeed', () => {
      let attempts = 0;
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('setTimeout')) return Buffer.from('');
        attempts++;
        if (attempts < 3) {
          throw new Error('Another process holds the git index lock: index.lock');
        }
        return 'success-output';
      });

      const result = GitSafePointManager.execGit('git status', mockCwd, 5, 10);
      expect(result).toBe('success-output');
      expect(attempts).toBe(3);
    });

    it('should throw error after maximum retries if index.lock persists', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('setTimeout')) return Buffer.from('');
        throw new Error('Another process holds the git index lock: index.lock');
      });

      expect(() => GitSafePointManager.execGit('git status', mockCwd, 3, 10)).toThrow(
        'Git command failed after 3 attempts'
      );
    });

    it('should throw immediately on non-lock shell errors', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });

      expect(() => GitSafePointManager.execGit('git status', mockCwd)).toThrow(
        'fatal: not a git repository'
      );
    });

    it('should absorb error in checkAndReleaseLock when fs access fails', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw, should absorb gracefully
      expect(() => GitSafePointManager.checkAndReleaseLock(mockCwd)).not.toThrow();
      existsSpy.mockRestore();
    });
  });


  describe('2. GitSafePointManager - Safe-Point Creation & Rollback', () => {
    it('should create a safe point successfully when git status is dirty', () => {
      const execSpy = vi.spyOn(GitSafePointManager, 'execGit')
        .mockImplementation((cmd) => {
          if (cmd.includes('rev-parse')) return 'true';
          if (cmd.includes('status')) return 'M src/file.ts';
          return ''; // git add, git commit
        });

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      const result = GitSafePointManager.createSafePoint(mockCwd);

      expect(result).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('git add -A', mockCwd);
      expect(execSpy).toHaveBeenCalledWith('git commit -m "ghita-temp-safepoint" --no-verify', mockCwd);
    });

    it('should NOT create a safe-point if git status is clean', () => {
      const execSpy = vi.spyOn(GitSafePointManager, 'execGit')
        .mockImplementation((cmd) => {
          if (cmd.includes('rev-parse')) return 'true';
          if (cmd.includes('status')) return '';
          return '';
        });

      const result = GitSafePointManager.createSafePoint(mockCwd);

      expect(result).toBe(false);
      expect(execSpy).not.toHaveBeenCalledWith('git add -A', mockCwd);
    });

    it('should hard rollback successfully when safepoint commit is found', () => {
      const execSpy = vi.spyOn(GitSafePointManager, 'execGit')
        .mockImplementation((cmd) => {
          if (cmd.includes('rev-parse')) return 'true';
          if (cmd.includes('log -1')) return 'ghita-temp-safepoint';
          return '';
        });

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      const result = GitSafePointManager.rollback(mockCwd);

      expect(result).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('git reset --hard HEAD~1', mockCwd);
      expect(execSpy).toHaveBeenCalledWith('git clean -fd', mockCwd);
    });

    it('should standard clean successfully when no safepoint commit is found', () => {
      const execSpy = vi.spyOn(GitSafePointManager, 'execGit')
        .mockImplementation((cmd) => {
          if (cmd.includes('rev-parse')) return 'true';
          if (cmd.includes('log -1')) return 'feat(agent): some commit';
          return '';
        });

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      const result = GitSafePointManager.rollback(mockCwd);

      expect(result).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('git reset --hard HEAD', mockCwd);
      expect(execSpy).toHaveBeenCalledWith('git clean -fd', mockCwd);
    });
  });

  describe('3. GitSafePointMiddleware', () => {
    let middleware: GitSafePointMiddleware;

    beforeEach(() => {
      middleware = new GitSafePointMiddleware();
    });

    it('should trigger safepoint creation on write tools', async () => {
      const createSpy = vi.spyOn(GitSafePointManager, 'createSafePoint').mockReturnValue(true);

      const res = await middleware.preTool('writeFile', { targetFile: 'src/main.ts' }, {} as any);

      expect(res).toBeDefined();
      expect(res!.proceed).toBe(true);
      expect(createSpy).toHaveBeenCalled();
    });

    it('should ignore non-write tools', async () => {
      const createSpy = vi.spyOn(GitSafePointManager, 'createSafePoint');

      const res = await middleware.preTool('readFile', { filePath: 'src/main.ts' }, {} as any);

      expect(res).toBeUndefined();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should trigger rollback and modify result when compiler or tests fail', async () => {
      const rollbackSpy = vi.spyOn(GitSafePointManager, 'rollback').mockReturnValue(true);

      const failedOutput = 'Vitest Failed: 2 tests crashed\nCommand failed with exit code 1';
      
      const res = await middleware.postTool('run_command', failedOutput, {} as any);

      expect(res).toBeDefined();
      expect(res!.modifiedResult).toContain('GIT SAFE-ROLLBACK GATES ACTIVATED');
      expect(res!.modifiedResult).toContain('crashed');
      expect(rollbackSpy).toHaveBeenCalled();
    });

    it('should bypass rollback on successful commands', async () => {
      const rollbackSpy = vi.spyOn(GitSafePointManager, 'rollback');

      const successOutput = 'Vitest Passed: All 12 tests passed successfully.';
      
      const res = await middleware.postTool('run_command', successOutput, {} as any);

      expect(res).toBeUndefined();
      expect(rollbackSpy).not.toHaveBeenCalled();
    });
  });
});
