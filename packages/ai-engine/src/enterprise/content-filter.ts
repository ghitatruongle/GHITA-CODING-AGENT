// ==============================================================================
// GHITA CODING AGENT - Phase 3.5: Content Filtering
// Input/output content filtering guardrails
// Reference: LiteLLM proxy/guardrails/
// ==============================================================================

// --- Types ---

export type FilterAction = 'block' | 'flag' | 'warn' | 'log' | 'mask';
export type ContentDirection = 'input' | 'output' | 'both';
export type ContentCategory =
  | 'hate'
  | 'violence'
  | 'sexual'
  | 'self_harm'
  | 'harassment'
  | 'spam'
  | 'malicious_code'
  | 'custom';

export interface ContentFilterRule {
  ruleId: string;
  name: string;
  description?: string;
  enabled: boolean;
  direction: ContentDirection;
  categories: ContentCategory[];
  action: FilterAction;
  /** Custom regex patterns */
  patterns?: RegExp[];
  /** Keywords to match (case-insensitive) */
  keywords?: string[];
  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;
  priority: number; // Higher = checked first
}

export interface ContentFilterResult {
  passed: boolean;
  action: FilterAction;
  matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    category: ContentCategory;
    action: FilterAction;
    confidence: number;
    matchedText?: string;
  }>;
  filteredContent?: string; // Content after masking/filtering
  summary: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<ContentCategory, boolean>;
  scores: Record<ContentCategory, number>;
}

// --- Built-in Filter Patterns ---

const BUILTIN_PATTERNS: Record<ContentCategory, RegExp[]> = {
  hate: [
    /\b(hate|kill|destroy)\s+(all|every)\s+\w+/i,
  ],
  violence: [
    /\b(how\s+to\s+)?(make|build|create)\s+(a\s+)?(bomb|explosive|weapon)/i,
    /\b(attack|assault|harm|hurt)\s+(someone|people|person)/i,
  ],
  sexual: [
    /\b(explicit|nsfw|pornographic)\s+(content|material|image)/i,
  ],
  self_harm: [
    /\b(how\s+to\s+)?(suicide|self[\s-]harm|cut\s+myself)/i,
    /\b(end\s+my\s+life|kill\s+myself)/i,
  ],
  harassment: [
    /\b(you\s+are|you\'re)\s+(stupid|idiot|dumb|worthless|trash)/i,
  ],
  spam: [
    /\b(buy\s+now|limited\s+offer|act\s+fast|free\s+money|click\s+here)\b/i,
    /\b(earn\s+\$?\d+.{0,20}(per|every)\s+(day|hour|week))/i,
  ],
  malicious_code: [
    /\b(rm\s+-rf|:(){ :\|:& };:|curl.*\|\s*(bash|sh))/i,
    /\b(format\s+c:|del\s+\/[sfq])/i,
  ],
  custom: [],
};

// --- Simple Keyword-based Sentiment Analysis ---

function analyzeToxicity(text: string): { score: number; categories: ContentCategory[] } {
  const lowerText = text.toLowerCase();
  const categories: ContentCategory[] = [];
  let maxScore = 0;

  for (const [category, patterns] of Object.entries(BUILTIN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        categories.push(category as ContentCategory);
        maxScore = Math.max(maxScore, 0.8);
      }
    }
  }

  // Additional keyword-based scoring
  const toxicKeywords = [
    'idiot', 'stupid', 'moron', 'trash', 'garbage', 'disgusting',
    'terrible', 'horrible', 'worst', 'pathetic', 'useless',
  ];

  let keywordHits = 0;
  for (const keyword of toxicKeywords) {
    if (lowerText.includes(keyword)) keywordHits++;
  }

  if (keywordHits > 0) {
    const keywordScore = Math.min(keywordHits * 0.2, 0.6);
    maxScore = Math.max(maxScore, keywordScore);
    if (!categories.includes('harassment')) {
      categories.push('harassment');
    }
  }

  return { score: maxScore, categories };
}

// --- Content Filter ---

export class ContentFilter {
  private rules: ContentFilterRule[] = [];
  private bannedKeywords: Set<string> = new Set();

  constructor(options?: {
    rules?: ContentFilterRule[];
    bannedKeywords?: string[];
  }) {
    if (options?.rules) {
      this.rules = options.rules.sort((a, b) => b.priority - a.priority);
    }
    if (options?.bannedKeywords) {
      for (const kw of options.bannedKeywords) {
        this.bannedKeywords.add(kw.toLowerCase());
      }
    }
  }

  /** Add a filter rule */
  addRule(rule: ContentFilterRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** Remove a rule */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.ruleId === ruleId);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }

  /** Add banned keywords */
  addBannedKeywords(keywords: string[]): void {
    for (const kw of keywords) {
      this.bannedKeywords.add(kw.toLowerCase());
    }
  }

  /** Remove banned keywords */
  removeBannedKeywords(keywords: string[]): void {
    for (const kw of keywords) {
      this.bannedKeywords.delete(kw.toLowerCase());
    }
  }

  /** Filter content */
  filter(content: string, direction: ContentDirection): ContentFilterResult {
    const matchedRules: ContentFilterResult['matchedRules'] = [];
    let filteredContent = content;
    let highestAction: FilterAction = 'log';

    const actionPriority: Record<FilterAction, number> = {
      block: 5,
      mask: 4,
      flag: 3,
      warn: 2,
      log: 1,
    };

    // Check rules
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.direction !== 'both' && rule.direction !== direction) continue;

      // Check patterns
      if (rule.patterns) {
        for (const pattern of rule.patterns) {
          const match = content.match(pattern);
          if (match) {
            matchedRules.push({
              ruleId: rule.ruleId,
              ruleName: rule.name,
              category: rule.categories[0] ?? 'custom',
              action: rule.action,
              confidence: 0.9,
              matchedText: match[0],
            });

            if (actionPriority[rule.action] > actionPriority[highestAction]) {
              highestAction = rule.action;
            }
          }
        }
      }

      // Check keywords
      if (rule.keywords) {
        const lowerContent = content.toLowerCase();
        for (const keyword of rule.keywords) {
          if (lowerContent.includes(keyword.toLowerCase())) {
            matchedRules.push({
              ruleId: rule.ruleId,
              ruleName: rule.name,
              category: rule.categories[0] ?? 'custom',
              action: rule.action,
              confidence: 1.0,
              matchedText: keyword,
            });

            if (actionPriority[rule.action] > actionPriority[highestAction]) {
              highestAction = rule.action;
            }
          }
        }
      }
    }

    // Check banned keywords
    const lowerContent = content.toLowerCase();
    for (const keyword of this.bannedKeywords) {
      if (lowerContent.includes(keyword)) {
        matchedRules.push({
          ruleId: 'banned_keyword',
          ruleName: 'Banned Keyword',
          category: 'custom',
          action: 'mask',
          confidence: 1.0,
          matchedText: keyword,
        });

        if (actionPriority['mask'] > actionPriority[highestAction]) {
          highestAction = 'mask';
        }
      }
    }

    // Check built-in patterns
    const toxicity = analyzeToxicity(content);
    if (toxicity.score > 0.5) {
      for (const category of toxicity.categories) {
        matchedRules.push({
          ruleId: 'builtin_toxicity',
          ruleName: 'Built-in Toxicity Detection',
          category,
          action: toxicity.score > 0.8 ? 'block' : 'flag',
          confidence: toxicity.score,
        });

        const detectedAction = toxicity.score > 0.8 ? 'block' : 'flag';
        if (actionPriority[detectedAction] > actionPriority[highestAction]) {
          highestAction = detectedAction;
        }
      }
    }

    // Apply masking if needed
    if (highestAction === 'mask') {
      filteredContent = this.applyMasking(content);
    }

    const passed = highestAction !== 'block';

    return {
      passed,
      action: highestAction,
      matchedRules,
      filteredContent: highestAction === 'mask' ? filteredContent : undefined,
      summary: passed
        ? matchedRules.length > 0
          ? `Content passed with ${matchedRules.length} warning(s)`
          : 'Content passed all filters'
        : `Content blocked: ${matchedRules.map((r) => r.ruleName).join(', ')}`,
    };
  }

  /** Quick check if content is safe */
  isSafe(content: string, direction: ContentDirection = 'both'): boolean {
    return this.filter(content, direction).passed;
  }

  /** Apply masking to sensitive content */
  private applyMasking(content: string): string {
    let masked = content;

    // Mask banned keywords
    for (const keyword of this.bannedKeywords) {
      const regex = new RegExp(keyword, 'gi');
      masked = masked.replace(regex, '*'.repeat(keyword.length));
    }

    return masked;
  }

  /** Get all rules */
  getRules(): ContentFilterRule[] {
    return [...this.rules];
  }

  /** Get banned keywords */
  getBannedKeywords(): string[] {
    return [...this.bannedKeywords];
  }

  /** Export rules as JSON for persistence */
  exportRules(): string {
    return JSON.stringify(
      {
        rules: this.rules.map((r) => ({
          ...r,
          patterns: r.patterns?.map((p) => p.source),
        })),
        bannedKeywords: [...this.bannedKeywords],
      },
      null,
      2
    );
  }
}
