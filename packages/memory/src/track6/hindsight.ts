// Post-session reflection that generates procedural notes and skill seeds.

//
// Pattern: oh-my-pi hindsight/autolearn.

export interface SessionReflection {
  sessionId: string;
  timestamp: number;
  /** Key takeaways from the session. */
  takeaways: string[];
  /** Procedural patterns observed (e.g. "always run tests before commit"). */
  proceduralNotes: string[];
  /** Skill seeds extracted from repeated workflows. */
  skillSeeds: SkillSeed[];
  /** Overall session quality score (0-1). */
  qualityScore: number;
}

export interface SkillSeed {
  id: string;
  name: string;
  description: string;
  triggerPattern: string;
  steps: string[];
  confidence: number;
  sourceSessionId: string;
  createdAt: number;
  status: 'seed' | 'review' | 'promoted' | 'rejected';
}

export interface HindsightConfig {
  /** Minimum messages in a session before generating reflection. */
  minMessages?: number;
  /** Minimum repeated pattern count to generate a skill seed. */
  minPatternRepeats?: number;
  /** Maximum skill seeds per session. */
  maxSeedsPerSession?: number;
}

const DEFAULT_CONFIG: Required<HindsightConfig> = {
  minMessages: 5,
  minPatternRepeats: 2,
  maxSeedsPerSession: 3,
};

/**
 * Analyze a completed session and produce a reflection with procedural
 * notes and skill seeds.
 */
export function reflectOnSession(
  messages: Array<{ role: string; content: string }>,
  sessionId: string,
  config: HindsightConfig = {},
): SessionReflection {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length < cfg.minMessages) {
    return {
      sessionId,
      timestamp: Date.now(),
      takeaways: [],
      proceduralNotes: [],
      skillSeeds: [],
      qualityScore: 0,
    };
  }

  const takeaways = extractTakeaways(messages);
  const proceduralNotes = extractProceduralPatterns(messages);
  const skillSeeds = extractSkillSeeds(messages, sessionId, cfg);

  // Quality score based on: resolution indicators, tool usage diversity,
  // and presence of verification steps
  const qualityScore = computeQualityScore(messages);

  return {
    sessionId,
    timestamp: Date.now(),
    takeaways,
    proceduralNotes,
    skillSeeds: skillSeeds.slice(0, cfg.maxSeedsPerSession),
    qualityScore,
  };
}

function extractTakeaways(messages: Array<{ role: string; content: string }>): string[] {
  const takeaways: string[] = [];
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');

  // Look for summary/conclusion patterns in assistant messages
  const conclusionPatterns = [
    /(?:in summary|to summarize|conclusion|key takeaway)[:\s]+(.+)/gi,
    /(?:done|completed|finished|resolved)[:\s]+(.+)/gi,
    /(?:the fix was|solution is|answer is)[:\s]+(.+)/gi,
  ];

  for (const msg of assistantMsgs) {
    for (const pattern of conclusionPatterns) {
      const matches = [...msg.content.matchAll(pattern)];
      for (const match of matches) {
        const text = (match[1] ?? '').trim();
        if (text.length > 10 && text.length < 300) {
          takeaways.push(text);
        }
      }
    }
  }

  // If no explicit conclusions, use last assistant message as fallback
  if (takeaways.length === 0 && assistantMsgs.length > 0) {
    const last = assistantMsgs[assistantMsgs.length - 1];
    if (last && last.content.length > 20 && last.content.length < 500) {
      takeaways.push(last.content.slice(0, 200));
    }
  }

  return takeaways.slice(0, 5);
}

function extractProceduralPatterns(messages: Array<{ role: string; content: string }>): string[] {
  const notes: string[] = [];
  const patterns: Array<{ regex: RegExp; template: string }> = [
    {
      regex: /\b(test|spec)\s+(?:first|before|then)\b/i,
      template: 'Run tests before making changes',
    },
    {
      regex: /\b(commit|push)\s+(?:after|once|when)\s+(?:test|build|lint)/i,
      template: 'Verify build/tests pass before committing',
    },
    {
      regex: /\b(backup|snapshot|save)\s+(?:before|first)\b/i,
      template: 'Create backup before destructive operations',
    },
    {
      regex: /\b(review|check)\s+(?:diff|change|pr)\s+(?:before|first)\b/i,
      template: 'Review changes before submitting',
    },
    {
      regex: /\b(read|understand)\s+(?:code|file|context)\s+(?:before|first)\b/i,
      template: 'Read existing code before modifying',
    },
    {
      regex: /\b(log|debug|trace)\s+(?:to|for)\s+(?:diagnos|find|identify)/i,
      template: 'Use logging to diagnose issues before fixing',
    },
  ];

  const seen = new Set<string>();
  for (const msg of messages) {
    for (const p of patterns) {
      if (p.regex.test(msg.content) && !seen.has(p.template)) {
        seen.add(p.template);
        notes.push(p.template);
      }
    }
  }

  return notes.slice(0, 5);
}

function extractSkillSeeds(
  messages: Array<{ role: string; content: string }>,
  sessionId: string,
  config: Required<HindsightConfig>,
): SkillSeed[] {
  const seeds: SkillSeed[] = [];

  // Detect repeated action sequences (tool calls or command patterns)
  const actionPatterns = new Map<string, number>();
  const actionRegex = /\b(run|execute|install|create|update|delete|fix|deploy|build|test)\s+\w+/gi;

  for (const msg of messages) {
    const matches = [...msg.content.matchAll(actionRegex)];
    for (const match of matches) {
      const action = match[0].toLowerCase();
      actionPatterns.set(action, (actionPatterns.get(action) ?? 0) + 1);
    }
  }

  // Generate seeds for actions that repeat enough
  let seedCount = 0;
  for (const [action, count] of actionPatterns) {
    if (count >= config.minPatternRepeats && seedCount < config.maxSeedsPerSession) {
      const words = action.split(/\s+/);
      const verb = words[0] ?? 'do';
      const target = words[1] ?? 'something';
      const name = `${verb}-${target}`;

      seeds.push({
        id: `seed_${Date.now().toString(36)}_${seedCount}`,
        name,
        description: `Automated workflow for: ${action}`,
        triggerPattern: action,
        steps: [action],
        confidence: Math.min(1, count / (config.minPatternRepeats * 2)),
        sourceSessionId: sessionId,
        createdAt: Date.now(),
        status: 'seed',
      });
      seedCount++;
    }
  }

  return seeds;
}

function computeQualityScore(messages: Array<{ role: string; content: string }>): number {
  let score = 0;

  // Factor 1: Has resolution indicators
  const hasResolution = messages.some((m) =>
    /(?:fixed|resolved|done|completed|working|passing|success)/i.test(m.content),
  );
  if (hasResolution) score += 0.3;

  // Factor 2: Has verification steps
  const hasVerification = messages.some((m) =>
    /(?:test|verify|check|validate|confirm|assert)/i.test(m.content),
  );
  if (hasVerification) score += 0.3;

  // Factor 3: Multi-turn engagement (not just one-shot)
  if (messages.length >= 10) score += 0.2;
  else if (messages.length >= 5) score += 0.1;

  // Factor 4: Tool usage diversity
  const toolMentions = new Set<string>();
  const toolRegex =
    /\b(read_file|write_file|run_command|search_code|grep_search|web_search|web_fetch)\b/g;
  for (const msg of messages) {
    const matches = [...msg.content.matchAll(toolRegex)];
    for (const match of matches) {
      toolMentions.add(match[0]);
    }
  }
  if (toolMentions.size >= 3) score += 0.2;
  else if (toolMentions.size >= 1) score += 0.1;

  return Math.min(1, score);
}

/**
 * Promote a skill seed to review queue.
 */
export function promoteSeedToReview(seed: SkillSeed): SkillSeed {
  return { ...seed, status: 'review' };
}

/**
 * Check if a seed meets promotion criteria.
 */
export function shouldPromoteSeed(seed: SkillSeed, threshold = 0.5): boolean {
  return seed.confidence >= threshold && seed.status === 'seed';
}
