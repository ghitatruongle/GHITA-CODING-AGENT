// ==============================================================================
// v1.1.5-beta1 Track 1.5 — Exec Policy pre-execution check tests
// ==============================================================================

import { describe, expect, it } from 'vitest';
import {
  checkCommand,
  parseSegment,
  splitCompound,
  tokenize,
  type ExecPolicyRule,
} from '../src/governance/exec-policy.js';

describe('command parsing', () => {
  it('tokenises respecting quotes', () => {
    expect(tokenize('git commit -m "fix: thing" --amend')).toEqual([
      'git',
      'commit',
      '-m',
      'fix: thing',
      '--amend',
    ]);
    expect(tokenize("echo 'a b'")).toEqual(['echo', 'a b']);
  });

  it('splits compound commands outside quotes', () => {
    expect(splitCompound('echo a && echo b')).toEqual(['echo a', 'echo b']);
    expect(splitCompound('echo a; echo b || echo c')).toEqual(['echo a', 'echo b', 'echo c']);
    expect(splitCompound('echo "a && b" | grep x')).toEqual(['echo "a && b"', 'grep x']);
    expect(splitCompound('git push --force')).toEqual(['git push --force']);
  });

  it('normalises the binary name (Windows paths + extensions)', () => {
    expect(parseSegment("'C:\\Program Files\\Git\\bin\\git.exe' status").binary).toBe('git');
    expect(parseSegment('/usr/bin/git status').binary).toBe('git');
    expect(parseSegment('git').binary).toBe('git');
  });
});

describe('checkCommand — default rules', () => {
  it('denies git push --force (DoD e2e case)', () => {
    const verdict = checkCommand('git push --force origin main');
    expect(verdict.decision).toBe('deny');
    expect(verdict.matchedRule?.id).toBe('git-force-push');
    expect(verdict.reason).toContain('force');
  });

  it('denies the -f short form of force push', () => {
    expect(checkCommand('git push -f origin main').decision).toBe('deny');
  });

  it('asks for --force-with-lease but allows a normal push', () => {
    expect(checkCommand('git push --force-with-lease origin main').decision).toBe('ask');
    expect(checkCommand('git push origin main').decision).toBe('allow');
  });

  it('does not fire push rules on other git subcommands', () => {
    expect(checkCommand('git status').decision).toBe('allow');
    expect(checkCommand('git commit -m "push --force"').decision).toBe('allow');
  });

  it('denies destructive disk/host commands', () => {
    expect(checkCommand('rm -rf /').decision).toBe('deny');
    expect(checkCommand('dd if=/dev/zero of=/dev/sda').decision).toBe('deny');
    expect(checkCommand('mkfs.ext4 /dev/sdb1').decision).toBe('deny');
    expect(checkCommand('shutdown -h now').decision).toBe('deny');
    expect(checkCommand('reboot').decision).toBe('deny');
  });

  it('evaluates every segment of compound commands', () => {
    expect(checkCommand('echo hi && git push --force').decision).toBe('deny');
    expect(checkCommand('echo hi && git push origin main').decision).toBe('allow');
  });

  it('deny wins over ask across segments', () => {
    const verdict = checkCommand('git push --force-with-lease origin main; git push --force');
    expect(verdict.decision).toBe('deny');
    expect(verdict.matchedRule?.id).toBe('git-force-push');
  });
});

describe('checkCommand — custom rules', () => {
  const rules: ExecPolicyRule[] = [
    {
      id: 'no-docker-run',
      effect: 'deny',
      binary: 'docker',
      subcommands: ['run'],
      reason: 'containers are managed by the sandbox profile',
    },
    {
      id: 'npm-publish-ask',
      effect: 'ask',
      binary: 'npm',
      subcommands: ['publish'],
      reason: 'publishing is a user decision',
    },
  ];

  it('matches subcommands and effects', () => {
    expect(checkCommand('docker run -it alpine', rules).decision).toBe('deny');
    expect(checkCommand('docker ps', rules).decision).toBe('allow');
    expect(checkCommand('npm publish', rules).decision).toBe('ask');
    expect(checkCommand('npm test', rules).decision).toBe('allow');
  });

  it('allow rule can override a default deny for specific args', () => {
    const relaxed: ExecPolicyRule[] = [
      ...rules,
      {
        id: 'allow-force-on-sandbox-remote',
        effect: 'allow',
        binary: 'git',
        subcommands: ['push'],
        argPattern: /--force.*origin\/sandbox/,
        reason: 'sandbox remote is disposable',
      },
    ];
    // Custom allow beats the imported DEFAULT rules only when they are not in
    // the same rule set — checkCommand uses exactly the provided list.
    expect(checkCommand('git push --force origin/sandbox', relaxed).decision).toBe('allow');
  });
});
