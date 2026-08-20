// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 1.5: Exec Policy (pre-exec check)
// ------------------------------------------------------------------------------
// Parse a shell command the agent is about to run and evaluate it against a
// policy rule set BEFORE spawning (pattern: codex-rs `execpolicy` — the
// command is inspected, never trusted). Compound commands (&&, ||, ;, |) are
// split and every segment must pass. `deny` wins over `ask`, `ask` over the
// default allow — matching the deny-default governance posture.
// ==============================================================================

/** Segment of a (possibly compound) shell command after splitting. */
export interface CommandSegment {
  /** Raw segment text (trimmed). */
  raw: string;
  /** Whitespace/quote-aware tokens. */
  tokens: string[];
  /** First token normalised to a bare binary name (basename, no extension). */
  binary: string;
}

export type ExecPolicyEffect = 'allow' | 'deny' | 'ask';

export interface ExecPolicyRule {
  id: string;
  effect: ExecPolicyEffect;
  /** Binary the rule applies to (e.g. 'git', 'rm', 'curl'). */
  binary: string;
  /**
   * Subcommand sequence that must appear right after the binary
   * (e.g. ['push'] for `git push …`). Empty = any usage of the binary.
   */
  subcommands?: string[];
  /** When set, the rule only fires if some argument matches this pattern. */
  argPattern?: RegExp;
  /** Deny/ask message shown to the model/user. */
  reason: string;
}

export interface ExecPolicyVerdict {
  decision: ExecPolicyEffect;
  matchedRule: ExecPolicyRule | null;
  /** Segment that triggered the verdict (null when allowed by default). */
  segment: CommandSegment | null;
  reason?: string;
}

/**
 * Sensible deny-default set. Focused on unambiguous destructive flags —
 * broader capability control stays with PolicyEngine rules/hooks.
 */
export const DEFAULT_EXEC_RULES: ExecPolicyRule[] = [
  {
    id: 'git-force-push',
    effect: 'deny',
    binary: 'git',
    subcommands: ['push'],
    argPattern: /(^|\s)(--force(=\S+)?|-f)(\s|$)/,
    reason:
      'git push --force can destroy remote history; push without force or use --force-with-lease behind explicit approval.',
  },
  {
    id: 'git-force-with-lease',
    effect: 'ask',
    binary: 'git',
    subcommands: ['push'],
    argPattern: /(^|\s)--force-with-lease(=\S+)?(\s|$)/,
    reason: 'git push --force-with-lease rewrites remote history; requires explicit user approval.',
  },
  {
    id: 'rm-root-recursive',
    effect: 'deny',
    binary: 'rm',
    argPattern: /(^|\s)(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)(\s|$)/,
    reason: 'recursive forced rm is destructive; delete precise paths instead.',
  },
  {
    id: 'disk-wipe',
    effect: 'deny',
    binary: 'dd',
    argPattern: /of=\/dev\/(disk|sd|nvme|hd)/,
    reason: 'dd writing to raw block devices can destroy disks.',
  },
  {
    id: 'mkfs',
    effect: 'deny',
    binary: 'mkfs',
    reason: 'filesystem creation formats a target device.',
  },
  {
    id: 'shutdown',
    effect: 'deny',
    binary: 'shutdown',
    reason: 'host shutdown is outside the agent sandbox.',
  },
  {
    id: 'reboot',
    effect: 'deny',
    binary: 'reboot',
    reason: 'host reboot is outside the agent sandbox.',
  },
];

/** Split a command line on shell separators (&&, ||, ;, |) outside quotes. */
export function splitCompound(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === ';' || ch === '|') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Tokenise a single command segment respecting single/double quotes. */
export function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) {
        quote = undefined;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function binaryName(token: string): string {
  const normalised = token.replaceAll('\\', '/');
  const base = normalised.split('/').pop() ?? token;
  // Windows: strip extension so C:\Program Files\Git\bin\git.exe → git
  const withoutExt = base.replace(/\.(exe|cmd|bat|com)$/i, '');
  return withoutExt.toLowerCase();
}

/** Parse one segment into tokens + normalised binary. */
export function parseSegment(raw: string): CommandSegment {
  const tokens = tokenize(raw);
  return { raw, tokens, binary: tokens.length > 0 ? binaryName(tokens[0] ?? '') : '' };
}

const EFFECT_PRECEDENCE: Record<ExecPolicyEffect, number> = { allow: 0, ask: 1, deny: 2 };

function evaluateSegment(segment: CommandSegment, rules: ExecPolicyRule[]): ExecPolicyVerdict {
  const args = segment.tokens.slice(1);
  const argsText = args.join(' ');
  let verdict: ExecPolicyVerdict = { decision: 'allow', matchedRule: null, segment: null };
  for (const rule of rules) {
    // Binary family match: a rule for `mkfs` also covers `mkfs.ext4`,
    // `mkfs.vfat`, … (variant binaries share the same capability).
    const binaryMatch =
      segment.binary === rule.binary || segment.binary.startsWith(`${rule.binary}.`);
    if (!binaryMatch) continue;
    if (rule.subcommands && rule.subcommands.length > 0) {
      const actualSub = args.slice(0, rule.subcommands.length);
      const subMatch =
        actualSub.length === rule.subcommands.length &&
        rule.subcommands.every((sub, index) => (actualSub[index] ?? '').toLowerCase() === sub);
      if (!subMatch) continue;
    }
    if (rule.argPattern && !rule.argPattern.test(argsText)) continue;
    if (EFFECT_PRECEDENCE[rule.effect] > EFFECT_PRECEDENCE[verdict.decision]) {
      verdict = { decision: rule.effect, matchedRule: rule, segment, reason: rule.reason };
    }
  }
  return verdict;
}

/**
 * Evaluate a full command line (all compound segments) against the rules.
 * The most severe verdict across segments wins.
 */
export function checkCommand(
  command: string,
  rules: ExecPolicyRule[] = DEFAULT_EXEC_RULES,
): ExecPolicyVerdict {
  const segments = splitCompound(command).map(parseSegment);
  let final: ExecPolicyVerdict = { decision: 'allow', matchedRule: null, segment: null };
  for (const verdict of segments.map((segment) => evaluateSegment(segment, rules))) {
    if (EFFECT_PRECEDENCE[verdict.decision] > EFFECT_PRECEDENCE[final.decision]) {
      final = verdict;
    }
  }
  return final;
}
