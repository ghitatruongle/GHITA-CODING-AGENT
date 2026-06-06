// ==============================================================================
// GHITA CODING AGENT - Skill Hub Registry
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { SkillTemplate } from '../auto-create/types.js';

export class SkillHub {
  private readonly hubPath: string;

  constructor(customHubPath?: string) {
    if (customHubPath) {
      this.hubPath = path.resolve(customHubPath);
    } else {
      this.hubPath = path.join(homedir(), '.ghita', 'skills');
    }
    this.ensureDirectory();
  }

  /**
   * Đảm bảo thư mục lưu trữ tồn tại
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.hubPath)) {
      fs.mkdirSync(this.hubPath, { recursive: true });
    }
  }

  /**
   * Lưu SkillTemplate xuống disk (dạng file JSON)
   */
  saveSkill(template: SkillTemplate): string {
    this.ensureDirectory();

    // Đảm bảo ID an toàn cho file system
    const safeId = template.id.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(this.hubPath, `${safeId}.json`);

    fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8');
    return template.id;
  }

  /**
   * Tải tất cả các skills tự định nghĩa từ disk
   */
  loadSkills(): SkillTemplate[] {
    this.ensureDirectory();
    const files = fs.readdirSync(this.hubPath);
    const skills: SkillTemplate[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(this.hubPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const skill = JSON.parse(content) as SkillTemplate;
          skills.push(skill);
        } catch (error) {
          console.error(`Lỗi khi đọc file skill ${file}:`, error);
        }
      }
    }

    return skills;
  }

  /**
   * Lấy một skill cụ thể theo ID
   */
  getSkill(id: string): SkillTemplate | null {
    const safeId = id.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(this.hubPath, `${safeId}.json`);

    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SkillTemplate;
    } catch {
      return null;
    }
  }

  /**
   * Xóa một skill khỏi disk
   */
  deleteSkill(id: string): boolean {
    const safeId = id.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(this.hubPath, `${safeId}.json`);

    if (!fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Serialize skill thành chuỗi JSON để xuất khẩu
   */
  exportSkill(id: string): string {
    const skill = this.getSkill(id);
    if (!skill) throw new Error(`Không tìm thấy skill với ID: ${id}`);
    return JSON.stringify(skill, null, 2);
  }

  /**
   * Import skill từ chuỗi JSON và lưu lại
   */
  importSkill(jsonContent: string): SkillTemplate {
    try {
      const skill = JSON.parse(jsonContent) as SkillTemplate;
      if (!skill.id || !skill.name || !skill.category) {
        throw new Error('Định dạng skill không hợp lệ (thiếu id, name hoặc category).');
      }
      this.saveSkill(skill);
      return skill;
    } catch (e) {
      throw new Error(`Lỗi import skill: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Tìm kiếm skills theo keyword
   */
  searchSkills(query: string): SkillTemplate[] {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const all = this.loadSkills();

    if (tokens.length === 0) return all;

    return all.filter((skill) => {
      const name = skill.name.toLowerCase();
      const desc = skill.description.toLowerCase();
      return tokens.every((token) => name.includes(token) || desc.includes(token));
    });
  }

  /**
   * Thống kê số lượng skills theo từng category
   */
  listCategories(): Map<string, number> {
    const all = this.loadSkills();
    const counts = new Map<string, number>();

    for (const skill of all) {
      counts.set(skill.category, (counts.get(skill.category) || 0) + 1);
    }

    return counts;
  }
}
