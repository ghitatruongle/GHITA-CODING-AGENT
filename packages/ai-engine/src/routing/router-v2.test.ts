import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'fs';
import { classifyTier, tierToBuckets, PersistentBanditRouter, RouterV2 } from './router-v2.js';

describe('classifyTier', () => {
  it('classifies short greetings as simple', () => {
    expect(classifyTier('hello')).toBe('simple');
    expect(classifyTier('thanks')).toBe('simple');
    expect(classifyTier('ok')).toBe('simple');
  });

  it('classifies complex requests as complex via keywords', () => {
    expect(classifyTier('refactor the auth module')).toBe('complex');
    expect(classifyTier('security audit of login flow')).toBe('complex');
  });

  it('classifies long detailed requests as complex', () => {
    const long =
      'Please analyze the security vulnerabilities in our authentication module and refactor ' +
      'the entire login flow to use OAuth2 with PKCE, then compare the performance implications ' +
      'of switching from JWT to opaque tokens across all microservices and document the migration ' +
      'strategy for the team.';
    expect(classifyTier(long)).toBe('complex');
  });

  it('classifies medium requests as moderate', () => {
    expect(
      classifyTier(
        'Can you add a new REST endpoint to the user authentication API that handles OAuth2 token refresh and session management with proper error handling and rate limiting for all microservices?',
      ),
    ).toBe('moderate');
  });

  it('respects custom thresholds', () => {
    expect(classifyTier('short msg', { simpleThreshold: 50 })).toBe('simple');
    expect(classifyTier('x'.repeat(100), { simpleThreshold: 50, complexThreshold: 150 })).toBe(
      'moderate',
    );
    expect(classifyTier('x'.repeat(200), { simpleThreshold: 50, complexThreshold: 150 })).toBe(
      'complex',
    );
  });
});

describe('tierToBuckets', () => {
  it('maps tiers to request buckets', () => {
    expect(tierToBuckets('simple')).toEqual(['chat', 'embed']);
    expect(tierToBuckets('moderate')).toEqual(['chat', 'tool', 'code']);
    expect(tierToBuckets('complex')).toEqual(['chat', 'tool', 'code', 'reasoning']);
  });
});

describe('PersistentBanditRouter', () => {
  afterEach(() => {
    // noop — each test uses :memory:
  });

  it('persists arm state and reloads on restart', () => {
    const r1 = new PersistentBanditRouter(':memory:');
    r1.registerArm('openai:gpt-4o', 'gpt-4o');
    r1.registerArm('anthropic:sonnet', 'sonnet');

    // Simulate learning: success for gpt-4o, failure for sonnet
    r1.observe('openai:gpt-4o', 'success', 100);
    r1.observe('openai:gpt-4o', 'success', 90);
    r1.observe('anthropic:sonnet', 'error', 500);

    const gptArm = r1.get('openai:gpt-4o');
    expect(gptArm?.wins).toBe(2);
    expect(gptArm?.alpha).toBe(4); // prior 2 + 2 wins

    const sonnetArm = r1.get('anthropic:sonnet');
    expect(sonnetArm?.losses).toBe(1);
    expect(sonnetArm?.beta).toBe(3); // prior 2 + 1 loss

    r1.close();
  });

  it('loads existing arms from a file-backed db on restart', () => {
    const dbPath = `router-v2-test-${Date.now()}.db`;
    const r1 = new PersistentBanditRouter(dbPath);
    r1.registerArm('arm-a', 'A');
    r1.observe('arm-a', 'success', 50);
    r1.close();

    // Restart: state should be loaded
    const r2 = new PersistentBanditRouter(dbPath);
    const arm = r2.get('arm-a');
    expect(arm).toBeDefined();
    expect(arm?.wins).toBe(1);
    expect(arm?.alpha).toBe(3); // prior 2 + 1
    r2.close();

    // Cleanup
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-wal`);
      fs.unlinkSync(`${dbPath}-shm`);
    } catch {
      /* best effort */
    }
  });
});

describe('RouterV2', () => {
  it('selects an arm with tier classification', () => {
    const router = new RouterV2({ dbPath: ':memory:' });
    router.registerArms([
      { id: 'fast-arm', label: 'fast' },
      { id: 'strong-arm', label: 'strong' },
    ]);

    const simple = router.select('hello there', 'chat');
    expect(simple.tier).toBe('simple');
    expect(simple.arm.id).toBeTruthy();

    const complex = router.select(
      'please refactor the entire authentication flow with proper security analysis',
      'chat',
    );
    expect(complex.tier).toBe('complex');
    expect(complex.arm.id).toBeTruthy();

    router.close();
  });

  it('restricts candidates per tier when tierArms is configured', () => {
    const router = new RouterV2({
      dbPath: ':memory:',
      tierArms: {
        simple: ['fast-arm'],
        complex: ['strong-arm'],
      },
    });
    router.registerArms([
      { id: 'fast-arm', label: 'fast' },
      { id: 'strong-arm', label: 'strong' },
    ]);

    const simple = router.select('hi');
    expect(simple.arm.id).toBe('fast-arm');

    const complex = router.select('refactor the entire system');
    expect(complex.arm.id).toBe('strong-arm');

    router.close();
  });

  it('persists observations across router instances on the same db', () => {
    const dbPath = `router-v2-integration-${Date.now()}.db`;
    const r1 = new RouterV2({ dbPath });
    r1.registerArms([{ id: 'a1' }, { id: 'a2' }]);
    r1.observe('a1', 'success', 10);
    r1.close();

    const r2 = new RouterV2({ dbPath });
    expect(r2.bandit.get('a1')?.wins).toBe(1);
    r2.close();

    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-wal`);
      fs.unlinkSync(`${dbPath}-shm`);
    } catch {
      /* best effort */
    }
  });
});
