// ==============================================================================
// GHITA CODING AGENT - Skills Auto-Creation Types
// ==============================================================================

import type { Skill, SkillCategory, SkillParameter } from '@ghita/shared';

/** Đại diện cho một bước trong trajectory */
export interface TrajectoryStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

/** Quá trình thực hiện tác vụ của Agent */
export interface TaskTrajectory {
  id: string;
  description: string;
  steps: TrajectoryStep[];
  totalDurationMs: number;
  success: boolean;
  startTime: number;
  endTime: number;
}

/** Ứng cử viên Skill được phát hiện từ Trajectory */
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

/** Template Skill được lưu cục bộ */
export interface SkillTemplate extends Skill {
  version: string;
  createdAt: number;
  sourceTrajectoryIds: string[];
  steps: Array<{
    toolName: string;
    inputTemplate: Record<string, unknown>;
  }>;
}

/** Đề xuất cải tiến Skill đã tồn tại */
export interface SkillImprovement {
  skillId: string;
  currentVersion: string;
  proposedChanges: string;
  reason: string;
  improvementType: 'parameter' | 'step' | 'description' | 'optimization';
  confidence: number; // 0.0 - 1.0
}

/** Lịch sử phiên bản của Skill */
export interface SkillVersion {
  version: string;
  template: SkillTemplate;
  createdAt: number;
  changesDescription: string;
  previousVersion?: string;
}

/** Cấu hình hệ thống tự tạo và tối ưu hóa Skill */
export interface AutoCreateConfig {
  minConfidence: number; // Ngưỡng confidence tối thiểu (ví dụ: 0.6)
  minSteps: number;      // Số bước tối thiểu (ví dụ: 3)
  maxSteps: number;      // Số bước tối đa (ví dụ: 20)
  autoSaveThreshold: number; // Tự động lưu không cần hỏi nếu confidence >= ngưỡng này (ví dụ: 0.85)
  enabledCategories: SkillCategory[];
}
