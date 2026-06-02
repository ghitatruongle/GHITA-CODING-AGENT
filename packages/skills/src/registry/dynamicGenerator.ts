// ==============================================================================
// GHITA CODING AGENT - Phase 7: Dynamic Skill Generation Loop
// ==============================================================================
// Tự đúc kết hoạt động terminal thành công thành các tệp kỹ năng JSON động
// Hỗ trợ che giấu thông tin mật, validate an toàn mã độc và đồng bộ hóa git
// ==============================================================================

import type { TaskTrajectory, TrajectoryStep, SkillTemplate } from '../auto-create/types.js';
import type { SkillHub } from './hub.js';
import type { SlashCommand } from '../commands/registry.js';

export class DynamicSkillGenerator {
  /**
   * Che giấu thông tin nhạy cảm như token, mật khẩu, API keys
   */
  public sanitizeCommand(cmd: string): string {
    let sanitized = cmd;
    
    // Che giấu API keys phổ biến
    sanitized = sanitized.replace(/(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED]');
    sanitized = sanitized.replace(/(ghp_[a-zA-Z0-9]{20,})/g, '[REDACTED]');
    sanitized = sanitized.replace(/(AIzaSy[a-zA-Z0-9_-]{20,})/g, '[REDACTED]');
    
    // Che giấu passwords trong lệnh gán hoặc query parameters
    sanitized = sanitized.replace(/(pass(?:word)?\s*=\s*)([a-zA-Z0-9_.-]+)/gi, '$1[REDACTED]');
    sanitized = sanitized.replace(/(?<!-)(-p\s*)([a-zA-Z0-9_.-]+)/gi, (match, p1, p2) => {
      if (/^(port|path|profile|protocol|phrase|prompt)/i.test(p2) && p1 === '-p') {
        return match;
      }
      return p1 + '[REDACTED]';
    });
    sanitized = sanitized.replace(/(--password\s+)([a-zA-Z0-9_.-]+)/gi, '$1[REDACTED]');

    return sanitized;
  }

  /**
   * Quét an toàn mã độc cho shell
   */
  public validateSkillSafety(jsonContent: string): { safe: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Quét schema cơ bản
      if (!parsed.id || !parsed.name || !parsed.category || !parsed.steps) {
        return { safe: false, error: 'JSON Schema không đúng định dạng agentskills.io' };
      }

      // Quét các lệnh độc hại trong steps
      const steps = parsed.steps as Array<{ toolName: string; inputTemplate?: Record<string, unknown> }>;
      
      const dangerousPatterns = [
        /\brm\s+-rf\s+\//,         // rm -rf /
        /\brm\s+-rf\s+\*/,         // rm -rf *
        /\brm\s+-rf\s+\./,         // rm -rf .
        /:\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // Fork bomb
        /\bdd\s+if=\/dev\/zero/,   // dd write
        /\bmkfs\b/,                // Format disk
        /\bchmod\s+-R\s+777\b/,    // Dangerous permissions
        /\bchown\s+-R\b/,
        /wget\s+.*-[a-zA-Z]*O\s*-.*\s*\|\s*(sh|bash|zsh)/, // Blind curl shell exec
        /curl\s+.*\s*\|\s*(sh|bash|zsh)/
      ];

      for (const step of steps) {
        if (step.toolName === 'terminal.run' && step.inputTemplate) {
          const command = (step.inputTemplate.command || '') as string;
          for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
              return { 
                safe: false, 
                error: `Phát hiện lệnh độc hại tiềm ẩn trong Terminal: "${command}"` 
              };
            }
          }
        }
      }

      return { safe: true };
    } catch {
      return { safe: false, error: 'Cú pháp JSON không hợp lệ' };
    }
  }

  /**
   * Ghi lại chuỗi câu lệnh terminal thành một TaskTrajectory thành công
   */
  public recordSession(commands: string[], outputs: string, filesChanged: string[]): TaskTrajectory {
    const steps: TrajectoryStep[] = commands.map((cmd, idx) => ({
      toolName: 'terminal.run',
      input: { command: this.sanitizeCommand(cmd) },
      output: idx === commands.length - 1 ? outputs : 'Success',
      success: true,
      durationMs: 100,
      timestamp: Date.now()
    }));

    return {
      id: `trajectory.${Date.now().toString(36)}`,
      description: `Terminal execution sequence affecting: [${filesChanged.join(', ')}]`,
      steps,
      totalDurationMs: steps.length * 100,
      success: true,
      startTime: Date.now() - steps.length * 100,
      endTime: Date.now()
    };
  }

  /**
   * Sinh tệp JSON và đăng ký ngầm vào SkillHub Registry cục bộ
   */
  public async generateAndRegister(
    commands: string[],
    _outputs: string,
    name: string,
    description: string,
    hub: SkillHub
  ): Promise<SkillTemplate> {
    const sanitizedCommands = commands.map(cmd => this.sanitizeCommand(cmd));
    const safeId = `auto.terminal.${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const steps = sanitizedCommands.map(cmd => ({
      toolName: 'terminal.run',
      inputTemplate: { command: cmd }
    }));

    const skillTemplate: SkillTemplate = {
      id: safeId,
      name,
      description,
      category: 'terminal',
      enabled: true,
      version: '0.1.0',
      createdAt: Date.now(),
      sourceTrajectoryIds: [`trajectory.${Date.now().toString(36)}`],
      steps
    };

    const jsonContent = JSON.stringify(skillTemplate, null, 2);
    const safetyCheck = this.validateSkillSafety(jsonContent);
    if (!safetyCheck.safe) {
      throw new Error(`Đóng gói Skill thất bại vì lý do bảo mật: ${safetyCheck.error}`);
    }

    // Đăng ký ngầm vào Registry
    hub.saveSkill(skillTemplate);

    return skillTemplate;
  }
}

/**
 * Slash command /skills-sync đồng bộ git các skill động
 */
export function createSkillsSyncCommand(hub: SkillHub): SlashCommand {
  return {
    name: 'Skills Sync',
    description: 'Đồng bộ hóa các skill tự đúc kết lên Git repository chung',
    trigger: '/skills-sync',
    usage: '/skills-sync',
    execute: async () => {
      try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const skills = hub.loadSkills().filter(s => s.id.startsWith('auto.'));
        if (skills.length === 0) {
          return '[SKILLS-SYNC] Không tìm thấy skill động tự tạo nào cần đồng bộ.';
        }

        // Lấy hubPath từ hub
        const hubPath = (hub as unknown as { hubPath: string }).hubPath;
        
        // Thực thi các lệnh git đồng bộ
        await execAsync(`git add "${hubPath}/*.json"`);
        const { stdout } = await execAsync('git status --porcelain');
        
        if (!stdout.trim()) {
          return '[SKILLS-SYNC] Toàn bộ các skill động cục bộ đã được đồng bộ hóa từ trước.';
        }

        await execAsync('git commit -m "sync: push dynamically generated skills"');
        
        // Thử git push, nếu lỗi (như chưa set remote) thì bắt exception
        try {
          await execAsync('git push');
          return `[SKILLS-SYNC] Đã đồng bộ thành công ${skills.length} skills động lên Git repository chung.`;
        } catch {
          return `[SKILLS-SYNC] Đã commit ${skills.length} skills động vào Local Git repository.\n(Lưu ý: Không thể push lên remote, vui lòng cấu hình "git remote add origin" trước).`;
        }
    } catch (err: unknown) {
      return `[SKILLS-SYNC] Lỗi trong quá trình đồng bộ Git: ${(err as Error)?.message || String(err)}`;
      }
    }
  };
}
