import type { SkillCategory, SkillParameter } from '@ghita/shared';
import type { AutoCreateConfig, TaskTrajectory, SkillCandidate, SkillTemplate } from './types.js';

const DEFAULT_CONFIG: AutoCreateConfig = {
  minConfidence: 0.6,
  minSteps: 3,
  maxSteps: 20,
  autoSaveThreshold: 0.85,
  enabledCategories: ['file', 'terminal', 'browser', 'computer', 'screenshot', 'app'],
};

export class SkillAutoCreator {
  private readonly config: AutoCreateConfig;

  constructor(config?: Partial<AutoCreateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyzeTrajectory(trajectory: TaskTrajectory): SkillCandidate | null {
    const steps = trajectory.steps;

    if (!trajectory.success) return null;
    if (steps.length < this.config.minSteps || steps.length > this.config.maxSteps) return null;

    const categories = steps.map((s) => this.resolveToolCategory(s.toolName));
    const mainCategory = this.getMostFrequent(categories) || 'terminal';

    if (!this.config.enabledCategories.includes(mainCategory)) return null;

    const parameters: Record<string, SkillParameter> = {};
    const stepTemplates: Array<{ toolName: string; inputTemplate: Record<string, unknown> }> = [];

    let paramCounter = 1;
    const valueToParamName = new Map<string, string>();

    for (const step of steps) {
      const inputTemplate: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(step.input)) {
        if (typeof value === 'string' && value.length > 3) {
          // Check if this string looks like a path, URL or key command that should be parameterized
          const isFilePath = value.includes('/') || value.includes('\\') || value.includes('.');
          const isUrl = value.startsWith('http://') || value.startsWith('https://');
          const isGenericString = value.split(' ').length > 2;

          if (isFilePath || isUrl || isGenericString) {
            let paramName = valueToParamName.get(value);
            if (!paramName) {
              const prefix = isUrl ? 'url' : isFilePath ? 'path' : 'text';
              paramName = `${prefix}_${paramCounter++}`;
              valueToParamName.set(value, paramName);

              parameters[paramName] = {
                type: 'string',
                description: `Tự động trích xuất: ${key} với giá trị "${value.slice(0, 30)}..."`,
                required: true,
                default: value,
              };
            }
            inputTemplate[key] = `{{${paramName}}}`;
          } else {
            inputTemplate[key] = value;
          }
        } else {
          inputTemplate[key] = value;
        }
      }

      stepTemplates.push({
        toolName: step.toolName,
        inputTemplate,
      });
    }

    const stepSuccessRate = steps.filter((s) => s.success).length / steps.length;
    const parameterRatio = Object.keys(parameters).length / steps.length;

    // Heuristic formula: 50% success rate, 30% step density, 20% parameterized level
    const densityScore = Math.min(1.0, steps.length / 8);
    const paramDensityScore = parameterRatio > 0 ? Math.min(1.0, 1.0 / parameterRatio) : 0.5;

    const confidence = stepSuccessRate * 0.5 + densityScore * 0.3 + paramDensityScore * 0.2;

    if (confidence < this.config.minConfidence) return null;

    const name = `Auto Skill: ${this.capitalize(mainCategory)} Process - ${trajectory.description.slice(0, 30)}`;
    const description = `Quy trình tự động hóa được học từ task: "${trajectory.description}". Bao gồm ${steps.length} bước sử dụng ${mainCategory}.`;

    return {
      name,
      description,
      category: mainCategory,
      parameters,
      steps: stepTemplates,
      confidence: Math.round(confidence * 100) / 100,
      sourceTrajectoryId: trajectory.id,
    };
  }

  generateTemplate(candidate: SkillCandidate): SkillTemplate {
    const id = `auto.${candidate.category}.${Date.now().toString(36)}`;
    return {
      id,
      name: candidate.name,
      description: candidate.description,
      category: candidate.category,
      enabled: true,
      parameters: candidate.parameters,
      version: '0.1.0',
      createdAt: Date.now(),
      sourceTrajectoryIds: [candidate.sourceTrajectoryId],
      steps: candidate.steps,
    };
  }

  shouldAutoSave(candidate: SkillCandidate): boolean {
    return candidate.confidence >= this.config.autoSaveThreshold;
  }

  findSimilarSkills(candidate: SkillCandidate, existingSkills: SkillTemplate[]): SkillTemplate[] {
    const queryTokens = this.tokenize(`${candidate.name  } ${  candidate.description}`);

    return existingSkills.filter((skill) => {
      if (skill.category !== candidate.category) return false;
      const skillTokens = this.tokenize(`${skill.name  } ${  skill.description}`);

      let matchCount = 0;
      for (const token of queryTokens) {
        if (skillTokens.has(token)) matchCount++;
      }

      const similarity = matchCount / Math.max(queryTokens.size, skillTokens.size);
      return similarity > 0.4; 
    });
  }

  // Private Helpers
  
  private resolveToolCategory(toolName: string): SkillCategory {
    const name = toolName.toLowerCase();
    if (name.startsWith('file.') || name.includes('file')) return 'file';
    if (
      name.startsWith('terminal.') ||
      name.includes('run_command') ||
      name.includes('cmd') ||
      name.includes('shell')
    )
      return 'terminal';
    if (name.includes('browser') || name.includes('url')) return 'browser';
    if (name.includes('screenshot') || name.includes('screen')) return 'screenshot';
    if (name.includes('app') || name.includes('open')) return 'app';
    return 'computer';
  }

  private getMostFrequent<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    const map = new Map<T, number>();
    let maxCount = 0;
    let mostFrequent: T | undefined;

    for (const item of arr) {
      const count = (map.get(item) || 0) + 1;
      map.set(item, count);
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = item;
      }
    }
    return mostFrequent;
  }

  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private tokenize(str: string): Set<string> {
    const matches = str.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    return new Set(matches.filter((t) => t.length > 2));
  }
}
