// ==============================================================================
// GHITA CODING AGENT - Slash Command Registry
// ==============================================================================

export interface SlashCommand {
  name: string;
  description: string;
  trigger: string; // e.g. "/code-review"
  usage?: string; // e.g. "/code-review [PR #]"
  execute: (args: string) => Promise<string>;
}

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  /** Đăng ký command */
  register(command: SlashCommand): void {
    this.commands.set(command.trigger, command);
  }

  /** Đăng ký nhiều commands */
  registerMany(commands: SlashCommand[]): void {
    for (const cmd of commands) {
      this.register(cmd);
    }
  }

  /** Xóa command */
  unregister(trigger: string): boolean {
    return this.commands.delete(trigger);
  }

  /** Lấy command theo trigger */
  get(trigger: string): SlashCommand | undefined {
    return this.commands.get(trigger);
  }

  /** Resolve input thành command + args */
  resolve(input: string): { command: SlashCommand; args: string } | null {
    const trimmed = input.trim();
    for (const [trigger, command] of this.commands) {
      if (trimmed.startsWith(trigger)) {
        const args = trimmed.substring(trigger.length).trim();
        return { command, args };
      }
    }
    return null;
  }

  /** Tìm commands matching prefix (cho autocomplete) */
  search(prefix: string): SlashCommand[] {
    const results: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (cmd.trigger.startsWith(prefix) || cmd.name.toLowerCase().includes(prefix.toLowerCase())) {
        results.push(cmd);
      }
    }
    return results;
  }

  /** Lấy tất cả commands */
  getAll(): SlashCommand[] {
    return [...this.commands.values()];
  }

  /** Kiểm tra input có phải slash command không */
  isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }
}
