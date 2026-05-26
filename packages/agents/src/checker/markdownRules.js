// ==============================================================================
// GHITA CODING AGENT - Phase 11: Source-Controlled Markdown CI Checks Gates
// ==============================================================================
// Quét quy tắc markdown `.ghita/checks/*.md` trong luồng CI (như cấm dùng any type)
// Chặn lưu tệp vi phạm quy định code sạch qua middleware.
// Tham chiếu: Continue (markdown checks)
// ==============================================================================
import fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
/**
 * Trình phân tích quy tắc markdown và quét mã nguồn tĩnh (AST / Regex)
 */
export class MarkdownRulesChecker {
    rules = [];
    constructor(rulesDir) {
        const dir = rulesDir ?? path.join(process.cwd(), '.ghita', 'checks');
        this.loadRules(dir);
    }
    /**
     * Tải và phân tích toàn bộ quy tắc *.md
     */
    loadRules(dir) {
        this.rules = [];
        if (!fs.existsSync(dir))
            return;
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const content = fs.readFileSync(fullPath, 'utf8');
                const rule = this.parseRuleMarkdown(file.replace('.md', ''), content);
                if (rule) {
                    this.rules.push(rule);
                }
            }
        }
        catch (err) {
            console.warn(`[MarkdownRulesChecker] Failed to load rules: ${err.message}`);
        }
    }
    /**
     * Phân tích tệp markdown ra đối tượng cấu trúc Rule
     */
    parseRuleMarkdown(defaultId, content) {
        const lines = content.split('\n');
        let severity = 'error';
        let files = ['**/*.ts', '**/*.tsx'];
        let astCheck;
        let pattern;
        let description = '';
        let readingDesc = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# Rule:')) {
                defaultId = trimmed.replace('# Rule:', '').trim();
            }
            else if (trimmed.startsWith('Severity:')) {
                const val = trimmed.replace('Severity:', '').trim().toLowerCase();
                severity = val === 'warning' ? 'warning' : 'error';
            }
            else if (trimmed.startsWith('Files:')) {
                files = trimmed.replace('Files:', '').trim().split(',').map(f => f.trim());
            }
            else if (trimmed.startsWith('ASTCheck:')) {
                const val = trimmed.replace('ASTCheck:', '').trim();
                if (val === 'any-keyword')
                    astCheck = 'any-keyword';
            }
            else if (trimmed.startsWith('Pattern:')) {
                pattern = trimmed.replace('Pattern:', '').trim();
            }
            else if (trimmed.startsWith('## Description')) {
                readingDesc = true;
            }
            else if (trimmed.startsWith('##') || trimmed.startsWith('#')) {
                readingDesc = false;
            }
            else if (readingDesc && trimmed.length > 0) {
                description += (description ? '\n' : '') + trimmed;
            }
        }
        return {
            id: defaultId,
            severity,
            files,
            description: description || 'No description provided.',
            astCheck,
            pattern
        };
    }
    /**
     * Kiểm tra xem tệp tin có khớp mẫu glob hay không (Hỗ trợ đơn giản *.ts và tương đương)
     */
    matchFilePattern(filePath, patterns) {
        const normalized = filePath.replace(/\\/g, '/');
        return patterns.some(pattern => {
            const cleanPattern = pattern.trim().replace(/\\/g, '/');
            if (cleanPattern === '**/*' || cleanPattern === '*')
                return true;
            // Mẫu đuôi extension như **/*.ts
            if (cleanPattern.startsWith('**/')) {
                const suffix = cleanPattern.substring(2); // e.g. "/*.ts"
                if (suffix.startsWith('/*.')) {
                    const ext = suffix.substring(3); // e.g. "ts" (without dot)
                    return normalized.endsWith(`.${ext}`);
                }
            }
            return normalized.includes(cleanPattern);
        });
    }
    /**
     * Quét tệp tin dựa trên các quy tắc đã nạp
     */
    checkFile(filePath, content) {
        const issues = [];
        for (const rule of this.rules) {
            if (!this.matchFilePattern(filePath, rule.files))
                continue;
            // 1. Quét AST nếu cấu hình astCheck
            if (rule.astCheck === 'any-keyword' && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
                const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
                const visitor = (node) => {
                    if (node.kind === ts.SyntaxKind.AnyKeyword) {
                        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                        issues.push({
                            ruleId: rule.id,
                            severity: rule.severity,
                            filePath,
                            line: line + 1, // 1-indexed
                            column: character + 1, // 1-indexed
                            message: rule.description
                        });
                    }
                    ts.forEachChild(node, visitor);
                };
                visitor(sourceFile);
            }
            // 2. Quét biểu thức chính quy Regex nếu có Pattern
            if (rule.pattern) {
                try {
                    const regex = new RegExp(rule.pattern, 'g');
                    let match;
                    while ((match = regex.exec(content)) !== null) {
                        // Tìm số dòng tương ứng vị trí khớp
                        const index = match.index;
                        const linesBefore = content.substring(0, index).split('\n');
                        const line = linesBefore.length;
                        const lastLine = linesBefore[linesBefore.length - 1] ?? '';
                        const column = lastLine.length + 1;
                        issues.push({
                            ruleId: rule.id,
                            severity: rule.severity,
                            filePath,
                            line,
                            column,
                            message: rule.description
                        });
                    }
                }
                catch (err) {
                    console.warn(`[MarkdownRulesChecker] Pattern regex error: ${err.message}`);
                }
            }
        }
        return issues;
    }
    getRules() {
        return this.rules;
    }
    /**
     * Tự động sinh đề xuất sửa đổi chuẩn cú pháp (Tác vụ 5)
     * Thay thế các từ khóa 'any' không an toàn bằng 'unknown'
     */
    generateFix(content) {
        const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);
        const replacements = [];
        const visitor = (node) => {
            if (node.kind === ts.SyntaxKind.AnyKeyword) {
                replacements.push({
                    start: node.getStart(),
                    end: node.getEnd(),
                    text: 'unknown'
                });
            }
            ts.forEachChild(node, visitor);
        };
        visitor(sourceFile);
        // Sắp xếp các đề xuất thay thế theo thứ tự ngược để tránh lệch vị trí offset
        replacements.sort((a, b) => b.start - a.start);
        let fixed = content;
        for (const r of replacements) {
            fixed = fixed.substring(0, r.start) + r.text + fixed.substring(r.end);
        }
        return fixed;
    }
    /**
     * Sinh chuỗi diff hiển thị dòng trước và sau sửa đổi
     */
    generateDiff(original, fixed) {
        const originalLines = original.split('\n');
        const fixedLines = fixed.split('\n');
        const diff = [];
        for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
            const orig = originalLines[i];
            const fix = fixedLines[i];
            if (orig !== fix) {
                if (orig !== undefined)
                    diff.push(`- Dòng ${i + 1}: ${orig}`);
                if (fix !== undefined)
                    diff.push(`+ Dòng ${i + 1}: ${fix}`);
            }
        }
        return diff.join('\n');
    }
}
/**
 * Middleware Agent chèn rào chắn preTool kiểm duyệt quy tắc code sạch (Tác vụ 3)
 */
export class MarkdownChecksMiddleware {
    name = 'MarkdownChecksMiddleware';
    priority = 6; // Chạy ngay sau AST-Lock
    checker;
    rulesDir;
    constructor(rulesDir) {
        this.rulesDir = rulesDir ?? path.join(process.cwd(), '.ghita', 'checks');
        this.checker = new MarkdownRulesChecker(this.rulesDir);
    }
    /**
     * Pre-tool hook: Chặn ghi file nếu vi phạm quy chuẩn code sạch
     */
    async preTool(toolName, args, _context) {
        const writeTools = ['writeFile', 'write_to_file', 'replace_file_content', 'multi_replace_file_content'];
        if (!writeTools.includes(toolName))
            return;
        let targetPath = (args.TargetFile || args.targetFile || args.filePath || args.targetPath);
        let newContent = (args.CodeContent || args.codeContent || args.ReplacementContent || args.replacementContent || args.content);
        if (!targetPath || !newContent)
            return;
        // Chuyển relative sang absolute path nếu cần
        const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath);
        // Nạp lại rules để phản ánh thay đổi mới nhất
        this.checker.loadRules(this.rulesDir);
        const issues = this.checker.checkFile(resolvedPath, newContent);
        const errors = issues.filter(i => i.severity === 'error');
        if (errors.length > 0) {
            // Ghi nhận log vi phạm (Tác vụ 7)
            this.logViolations(resolvedPath, errors);
            const errorDetail = errors
                .map(e => `- [Dòng ${e.line}, Cột ${e.column}] Lỗi [${e.ruleId}]: ${e.message}`)
                .join('\n');
            // Tự động sinh diff đề xuất sửa đổi chuẩn cú pháp (Tác vụ 5)
            const proposedFix = this.checker.generateFix(newContent);
            const proposedDiff = this.checker.generateDiff(newContent, proposedFix);
            const diffSection = proposedDiff
                ? `\n\n💡 Đề xuất tự động sửa đổi chuẩn cú pháp:\n\`\`\`diff\n${proposedDiff}\n\`\`\``
                : '';
            return {
                proceed: false,
                reason: `[CI CHECK GATE BLOCKED (AST-RULE-001)]\nLưu tệp tin bị từ chối do vi phạm quy chuẩn code sạch được định nghĩa trong '.ghita/checks/'.\nChi tiết vi phạm:\n${errorDetail}${diffSection}\nVui lòng sửa đổi lại code để tiếp tục.`
            };
        }
        return { proceed: true };
    }
    /**
     * Lưu log vi phạm xuống file log tĩnh (Tác vụ 7)
     */
    logViolations(filePath, errors) {
        try {
            const logDir = path.join(process.cwd(), '.ghita');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const logPath = path.join(logDir, 'markdown-checks-violations.log');
            const timestamp = new Date().toISOString();
            for (const e of errors) {
                const logMsg = `[${timestamp}] [VIOLATION] File: ${filePath} Line: ${e.line} Rule: ${e.ruleId} - ${e.message}\n`;
                fs.appendFileSync(logPath, logMsg, 'utf8');
            }
        }
        catch {
            // Tránh crash
        }
    }
}
//# sourceMappingURL=markdownRules.js.map