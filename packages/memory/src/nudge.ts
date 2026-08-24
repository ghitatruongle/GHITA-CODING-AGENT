import type { MemoryEntry } from '@ghita/shared';

export interface NudgeSuggestion {
  id: string;
  type: 'preference' | 'fact' | 'solution' | 'knowledge';
  content: string;
  confidence: number; // 0.0 - 1.0
  sourceMessage: string;
  reason: string;
}

export interface NudgePattern {
  name: string;
  type: NudgeSuggestion['type'];
  regex: RegExp;
  confidenceBoost: number;
  extractor: (match: RegExpMatchArray, fullMessage: string) => string;
}

export interface NudgeConfig {
  minConfidence: number; 
  autoSaveThreshold: number; 
  patterns?: NudgePattern[];
}

const DEFAULT_PATTERNS: NudgePattern[] = [
  
  {
    name: 'preference_en',
    type: 'preference',
    regex:
      /\b(?:i prefer|i like|i always use|my preferred|use (?:only|always))\b\s*([^.!?\n]{5,100})/i,
    confidenceBoost: 0.8,
    extractor: (match) => `User prefers: ${match?.[1]?.trim() ?? ''}`,
  },
  {
    name: 'preference_vi',
    type: 'preference',
    regex: /(?:tôi thích|tôi muốn|luôn dùng|hãy luôn|hãy chỉ)\s*([^.!?\n]{5,100})/i,
    confidenceBoost: 0.8,
    extractor: (match) => `Người dùng muốn: ${match?.[1]?.trim() ?? ''}`,
  },
  
  {
    name: 'fact_en',
    type: 'fact',
    regex: /\b(?:my name is|i am working on|this project is|i work as a)\b\s*([^.!?\n]{5,100})/i,
    confidenceBoost: 0.75,
    extractor: (match) => `User profile fact: ${match?.[0]?.trim() ?? ''}`,
  },
  {
    name: 'fact_vi',
    type: 'fact',
    regex: /(?:tên tôi là|tôi đang làm|dự án này là|công việc của tôi là)\s*([^.!?\n]{5,100})/i,
    confidenceBoost: 0.75,
    extractor: (match) => `Thông tin người dùng: ${match?.[0]?.trim() ?? ''}`,
  },
  
  {
    name: 'solution_en',
    type: 'solution',
    regex:
      /\b(?:i solved it by|the solution (?:was|is)|the fix (?:was|is)|fixed by doing)\b\s*([^.!?\n]{10,150})/i,
    confidenceBoost: 0.85,
    extractor: (match) => `Solution learned: ${match?.[0]?.trim() ?? ''}`,
  },
  {
    name: 'solution_vi',
    type: 'solution',
    regex:
      /(?:cách sửa là|đã sửa bằng cách|giải quyết bằng|phương án sửa là)\s*([^.!?\n]{10,150})/i,
    confidenceBoost: 0.85,
    extractor: (match) => `Cách khắc phục đã học: ${match?.[0]?.trim() ?? ''}`,
  },
  
  {
    name: 'knowledge_en',
    type: 'knowledge',
    regex: /\b(?:remember that|important note|note that|keep in mind)\b\s*([^.!?\n]{8,120})/i,
    confidenceBoost: 0.7,
    extractor: (match) => `Important Note: ${match?.[1]?.trim() ?? ''}`,
  },
  {
    name: 'knowledge_vi',
    type: 'knowledge',
    regex: /(?:hãy nhớ rằng|lưu ý quan trọng|lưu ý là|cần nhớ là)\s*([^.!?\n]{8,120})/i,
    confidenceBoost: 0.7,
    extractor: (match) => `Chú ý quan trọng: ${match?.[1]?.trim() ?? ''}`,
  },
];

export class MemoryNudgeEngine {
  private readonly config: Required<NudgeConfig>;
  private readonly customPatterns: NudgePattern[] = [];

  constructor(config?: Partial<NudgeConfig>) {
    this.config = {
      minConfidence: config?.minConfidence ?? 0.6,
      autoSaveThreshold: config?.autoSaveThreshold ?? 0.85,
      patterns: config?.patterns ?? DEFAULT_PATTERNS,
    };
  }

  analyzeForNudges(messages: Array<{ role: string; content: string }>): NudgeSuggestion[] {
    const suggestions: NudgeSuggestion[] = [];
    const activePatterns = [...this.config.patterns, ...this.customPatterns];

    for (const msg of messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue;

      for (const pattern of activePatterns) {
        
        if (pattern.type !== 'solution' && msg.role !== 'user') continue;

        const match = msg.content.match(pattern.regex);
        if (match) {
          const content = pattern.extractor(match, msg.content);

          const lengthFactor = Math.min(1.0, content.length / 50);
          const confidence =
            Math.round((pattern.confidenceBoost * 0.8 + lengthFactor * 0.2) * 100) / 100;

          if (confidence >= this.config.minConfidence) {
            suggestions.push({
              id: `nudge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              type: pattern.type,
              content,
              confidence,
              sourceMessage: msg.content,
              reason: `Khớp mẫu nhận diện "${pattern.name}" với độ tin cậy cao.`,
            });
          }
        }
      }
    }

    return suggestions;
  }

  shouldAutoSave(nudge: NudgeSuggestion): boolean {
    return nudge.confidence >= this.config.autoSaveThreshold;
  }

  addCustomPattern(pattern: NudgePattern): void {
    this.customPatterns.push(pattern);
  }

  toMemoryEntry(nudge: NudgeSuggestion): MemoryEntry {
    let type: MemoryEntry['type'] = 'fact';
    if (nudge.type === 'preference') type = 'preference';
    if (nudge.type === 'knowledge') type = 'context';
    if (nudge.type === 'solution') type = 'conversation';

    return {
      id: `mem_nudge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content: nudge.content,
      metadata: {
        sourceMessage: nudge.sourceMessage.slice(0, 200),
        confidence: nudge.confidence,
        automaticallySaved: this.shouldAutoSave(nudge),
      },
      timestamp: Date.now(),
    };
  }
}
