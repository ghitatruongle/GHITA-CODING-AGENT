import type { Skill, SkillCategory, SkillParameter } from '@ghita/shared';

export interface TrajectoryStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

export interface TaskTrajectory {
  id: string;
  description: string;
  steps: TrajectoryStep[];
  totalDurationMs: number;
  success: boolean;
  startTime: number;
  endTime: number;
}

export interface SkillCandidate {
  name: string;
  description: string;
  category: SkillCategory;
  parameters: Record<string, SkillParameter>;
  steps: Array<{
    toolName: string;
    inputTemplate: Record<string, unknown>;
  }>;
  confidence: number; // 0.0 - 1.0
  sourceTrajectoryId: string;
}

export interface SkillTemplate extends Skill {
  version: string;
  createdAt: number;
  sourceTrajectoryIds: string[];
  steps: Array<{
    toolName: string;
    inputTemplate: Record<string, unknown>;
  }>;
}

export interface SkillImprovement {
  skillId: string;
  currentVersion: string;
  proposedChanges: string;
  reason: string;
  improvementType: 'parameter' | 'step' | 'description' | 'optimization';
  confidence: number; // 0.0 - 1.0
}

export interface SkillVersion {
  version: string;
  template: SkillTemplate;
  createdAt: number;
  changesDescription: string;
  previousVersion?: string;
}

export interface AutoCreateConfig {
  minConfidence: number; 
  minSteps: number; 
  maxSteps: number; 
  autoSaveThreshold: number; 
  enabledCategories: SkillCategory[];
}
