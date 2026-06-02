// ==============================================================================
// GHITA CODING AGENT - Slash Command Registry
// Phase 2.2: Extended with flags, parsed args, history, custom commands
// ==============================================================================

export interface SlashCommandFlag {
  name: string;         // e.g. '--verbose'
  short?: string;       // e.g. '-v'
  description: string;
  type: 'boolean' | 'string';
  required?: boolean;
  default?: unknown;
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export interface SlashCommand {
  name: string;
  description: string;
  trigger: string; // e.g. "/code-review"
  usage?: string; // e.g. "/code-review [PR #]"
  flags?: SlashCommandFlag[];
  execute: (args: string, parsedArgs?: ParsedArgs) => Promise<string>;
}

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();
  private history: string[] = [];

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
  resolve(input: string): { command: SlashCommand; args: string; parsedArgs: ParsedArgs } | null {
    const trimmed = input.trim();
    for (const [trigger, command] of this.commands) {
      if (trimmed.startsWith(trigger)) {
        const args = trimmed.substring(trigger.length).trim();
        const parsedArgs = this.parseArgs(args, command.flags);
        return { command, args, parsedArgs };
      }
    }
    return null;
  }

  /** Tìm commands matching prefix (cho autocomplete) */
  search(prefix: string, limit = 10): SlashCommand[] {
    const results: SlashCommand[] = [];
    const lower = prefix.toLowerCase();
    for (const cmd of this.commands.values()) {
      if (cmd.trigger.startsWith(prefix) || cmd.name.toLowerCase().includes(lower)) {
        results.push(cmd);
      }
    }
    // Sort: exact prefix first, then alphabetical
    results.sort((a, b) => {
      const aExact = a.trigger.startsWith(prefix) ? 0 : 1;
      const bExact = b.trigger.startsWith(prefix) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.trigger.localeCompare(b.trigger);
    });
    return results.slice(0, limit);
  }

  /** Lấy tất cả commands */
  getAll(): SlashCommand[] {
    return [...this.commands.values()];
  }

  /** Kiểm tra input có phải slash command không */
  isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  /** Thêm vào history */
  pushHistory(input: string): void {
    if (input.trim()) {
      this.history.push(input.trim());
      if (this.history.length > 100) this.history.shift();
    }
  }

  /** Lấy history */
  getHistory(): readonly string[] {
    return this.history;
  }

  /** Navigate history */
  navigateHistory(currentIndex: number, direction: 'up' | 'down'): { entry: string; index: number } | null {
    if (this.history.length === 0) return null;
    let newIndex: number;
    if (direction === 'up') {
      newIndex = currentIndex <= 0 ? this.history.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex >= this.history.length - 1 ? 0 : currentIndex + 1;
    }
    return { entry: this.history[newIndex] ?? '', index: newIndex };
  }

  /** Parse arguments với flags */
  private parseArgs(input: string, flags?: SlashCommandFlag[]): ParsedArgs {
    const result: ParsedArgs = { positional: [], flags: {} };

    // Set defaults
    if (flags) {
      for (const flag of flags) {
        if (flag.default !== undefined) {
          result.flags[flag.name] = flag.default as string | boolean;
        }
      }
    }

    if (!input) return result;

    // Tokenize respecting quoted strings
    const tokens = this.tokenize(input);
    let i = 0;

while (i < tokens.length) {
  const token = tokens[i];
  if (!token) { i++; continue; }

  if (token.startsWith('--')) {
    // Long flag
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      // --flag=value
      const name = token.substring(2, eqIdx);
      result.flags[name] = token.substring(eqIdx + 1);
    } else {
      const name = token.substring(2);
      const flagDef = flags?.find((f) => f.name === `--${name}`);
      if (flagDef?.type === 'boolean') {
        result.flags[name] = true;
      } else if (i + 1 < tokens.length && !tokens[i + 1]?.startsWith('-')) {
        const nextToken = tokens[i + 1];
        if (nextToken) result.flags[name] = nextToken;
        i++;
      } else {
        result.flags[name] = true;
      }
    }
  } else if (token.startsWith('-') && token.length === 2) {
    // Short flag
    const short = token[1];
    if (!short) { i++; continue; }
    const flagDef = flags?.find((f) => f.short === `-${short}`);
    const name = flagDef?.name?.substring(2) ?? short;
    if (flagDef?.type === 'boolean') {
      result.flags[name] = true;
    } else if (i + 1 < tokens.length && !tokens[i + 1]?.startsWith('-')) {
      const nextToken = tokens[i + 1];
      if (nextToken) result.flags[name] = nextToken;
      i++;
    } else {
      result.flags[name] = true;
    }
  } else {
    result.positional.push(token);
  }
  i++;
}

    return result;
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
    if (!ch) continue;

      if (inQuote) {
        if (ch === quoteChar) {
          inQuote = false;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ' ') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }

    if (current) tokens.push(current);
    return tokens;
  }
}
