// ==============================================================================
// GHITA CODING AGENT - Skill Self-Improvement Engine
// ==============================================================================

import type { TaskTrajectory, SkillTemplate, SkillImprovement, SkillVersion } from './types.js';

export class SkillImprover {
  /**
   * So sánh hai lần chạy (gốc và chạy thử nghiệm lại) của cùng một skill.
   * Nếu lần chạy mới hiệu quả hơn (nhanh hơn, ít lỗi hơn hoặc thành công),
   * đề xuất cải tiến tham số hoặc cấu trúc các bước.
   */
  compareOutcomes(original: TaskTrajectory, rerun: TaskTrajectory, skillId: string): SkillImprovement | null {
    if (!original.success && rerun.success) {
      return {
        skillId,
        currentVersion: '0.1.0',
        proposedChanges: 'Cập nhật chuỗi các bước dựa trên lần thử lại thành công.',
        reason: 'Lần chạy lại thành công trong khi lần chạy gốc thất bại.',
        improvementType: 'step',
        confidence: 0.9,
      };
    }

    if (original.success && rerun.success) {
      const timeSaved = original.totalDurationMs - rerun.totalDurationMs;
      // Nếu thời gian chạy mới tiết kiệm hơn 20%
      if (timeSaved > 0 && timeSaved / original.totalDurationMs > 0.2) {
        return {
          skillId,
          currentVersion: '0.1.0',
          proposedChanges: 'Tối ưu hóa thời gian thực thi bằng cách rút ngắn các bước trung gian.',
          reason: `Thời gian thực thi giảm từ ${Math.round(original.totalDurationMs / 1000)}s xuống còn ${Math.round(rerun.totalDurationMs / 1000)}s (tiết kiệm ${Math.round((timeSaved / original.totalDurationMs) * 100)}%).`,
          improvementType: 'optimization',
          confidence: 0.8,
        };
      }
    }

    return null;
  }

  /**
   * Phân tích nhiều lần sử dụng một skill để phát hiện các cơ hội cải tiến,
   * chẳng hạn như phát hiện tham số tĩnh nào nên được biến đổi thành tham số động.
   */
  suggestImprovement(skill: SkillTemplate, trajectories: TaskTrajectory[]): SkillImprovement | null {
    if (trajectories.length < 2) return null;

    const successfulRuns = trajectories.filter(t => t.success);
    if (successfulRuns.length === 0) return null;

    // Phân tích input của các bước qua nhiều lần chạy để phát hiện hằng số khác nhau
    // Nếu có một giá trị hardcoded trong stepTemplate mà lại thay đổi ở các lần chạy thực tế,
    // đề xuất chuyển nó thành parameter.
    const paramSuggestions: string[] = [];
    
    // Giả lập phân tích tĩnh
  const firstRun = successfulRuns[0];
  if (!firstRun) return null;
  const otherRuns = successfulRuns.slice(1);

  for (let stepIndex = 0; stepIndex < skill.steps.length; stepIndex++) {
    const step = skill.steps[stepIndex];
    if (!step) continue;
      const actualInputFirst = firstRun.steps[stepIndex]?.input;
      
      if (!actualInputFirst) continue;

      for (const [key, val] of Object.entries(step.inputTemplate)) {
        // Nếu trường này chưa phải là parameter động {{param}}
        if (typeof val === 'string' && !val.startsWith('{{')) {
          // So sánh với các lần chạy khác
          const isDifferentInOtherRuns = otherRuns.some(run => {
            const actualVal = run.steps[stepIndex]?.input[key];
            return actualVal !== undefined && actualVal !== val;
          });

          if (isDifferentInOtherRuns) {
            paramSuggestions.push(`Trường "${key}" trong bước ${stepIndex + 1} ("${step.toolName}") thay đổi giữa các phiên chạy. Đề xuất biến đổi thành tham số động.`);
          }
        }
      }
    }

    if (paramSuggestions.length > 0) {
      return {
        skillId: skill.id,
        currentVersion: skill.version,
        proposedChanges: paramSuggestions.join('\n'),
        reason: 'Phát hiện sự biến đổi giá trị của các hằng số tĩnh qua các phiên chạy khác nhau.',
        improvementType: 'parameter',
        confidence: 0.85,
      };
    }

    return null;
  }

  /**
   * Tạo phiên bản mới của Skill từ cải tiến được duyệt
   */
  createNewVersion(skill: SkillTemplate, improvement: SkillImprovement): SkillVersion {
    const currentParts = skill.version.split('.').map(Number);
    // Tăng số minor (0.1.0 -> 0.2.0) cho parameter/step, patch cho optimization
    if (improvement.improvementType === 'parameter' || improvement.improvementType === 'step') {
      currentParts[1] = (currentParts[1] ?? 0) + 1;
      currentParts[2] = 0;
    } else {
      currentParts[2] = (currentParts[2] ?? 0) + 1;
    }
    const newVersionStr = currentParts.join('.');

    // Cập nhật cấu trúc
    const updatedSkill: SkillTemplate = {
      ...skill,
      version: newVersionStr,
    };

    // Áp dụng đề xuất một cách heuristic (thực tế sẽ được tinh chỉnh bởi LLM ở UI layer)
    if (improvement.improvementType === 'parameter') {
      // Heuristic: Thêm tham số mới giả lập
      const newParamName = `dynamic_param_${Date.now().toString(36).slice(-4)}`;
      updatedSkill.parameters = {
        ...updatedSkill.parameters,
        [newParamName]: {
          type: 'string',
          description: 'Tham số động được thêm tự động qua phân tích sử dụng',
          required: false,
        }
      };
    }

    return {
      version: newVersionStr,
      template: updatedSkill,
      createdAt: Date.now(),
      changesDescription: `[${improvement.improvementType.toUpperCase()}] ${improvement.proposedChanges}. Lý do: ${improvement.reason}`,
      previousVersion: skill.version,
    };
  }
}
