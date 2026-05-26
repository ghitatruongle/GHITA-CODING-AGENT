// ==============================================================================
// GHITA CODING AGENT - Phase 3: AST-Lock (Semantic AST Boundary Locking)
// ==============================================================================
// Khóa và bảo vệ ranh giới cú pháp của các symbol trong 27 ngôn ngữ
// Ngăn chặn Agent tự ý sửa đè lên code lân cận
// ==============================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PolyglotTagParser } from '@ghita/shared/node';
// ==============================================================================
// Utility Functions
// ==============================================================================
/**
 * Xây dựng cấu trúc phân cấp Class.Method cho SymbolTag
 */
export function buildHierarchy(tags) {
    const hSymbols = tags.map(t => ({
        ...t,
        children: [],
        scope: ''
    }));
    // Sắp xếp theo kích thước phạm vi dòng (node lớn nhất trước)
    const definitions = hSymbols.filter(n => n.kind === 'definition').sort((a, b) => {
        const sizeA = a.endLine - a.startLine;
        const sizeB = b.endLine - b.startLine;
        return sizeB - sizeA;
    });
    // Gán mỗi child cho immediate parent (parent nhỏ nhất chứa child)
    for (let j = 0; j < definitions.length; j++) {
        const child = definitions[j];
        let bestParent = null;
        let bestSize = Infinity;
        for (let i = 0; i < definitions.length; i++) {
            if (i === j)
                continue;
            const candidate = definitions[i];
            const candidateSize = candidate.endLine - candidate.startLine;
            if (child.startLine >= candidate.startLine &&
                child.endLine <= candidate.endLine &&
                candidateSize < bestSize) {
                bestParent = candidate;
                bestSize = candidateSize;
            }
        }
        if (bestParent) {
            bestParent.children.push(child);
            child.parentName = bestParent.name;
        }
    }
    // Xác định root definitions (không phải con của definition nào khác)
    const childSet = new Set();
    for (const def of definitions) {
        for (const ch of def.children) {
            childSet.add(ch);
        }
    }
    const rootDefinitions = definitions.filter(d => !childSet.has(d));
    function assignScope(node, parentScope) {
        node.scope = parentScope ? `${parentScope}.${node.name}` : node.name;
        for (const child of node.children) {
            assignScope(child, node.scope);
        }
    }
    // Gán scope phân cấp từ root nodes
    for (const node of rootDefinitions) {
        assignScope(node, '');
    }
    // Gán scope cho reference nodes — tìm immediate parent
    for (const node of hSymbols) {
        if (node.kind === 'reference' && !node.scope) {
            let bestParent = null;
            let bestSize = Infinity;
            for (const d of definitions) {
                const size = d.endLine - d.startLine;
                if (node.startLine >= d.startLine &&
                    node.endLine <= d.endLine &&
                    size < bestSize) {
                    bestParent = d;
                    bestSize = size;
                }
            }
            node.scope = bestParent ? `${bestParent.scope}.${node.name}` : node.name;
        }
    }
    return hSymbols;
}
/**
 * Tính toán mã băm SHA256 cho code đã loại bỏ toàn bộ khoảng trắng và ngắt dòng
 * (Tối ưu hóa tránh False Alarm khi thay đổi định dạng khoảng trắng)
 */
export function computeSemanticHash(nodeText) {
    const normalized = nodeText.replace(/\s+/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}
/**
 * Trình quét cấu hình YAML tối giản không cần thư viện ngoài
 */
export function loadASTLockConfig(configPath = '.ghita/rules.yaml') {
    const config = {
        lockedSymbols: [],
        enabled: true,
        excludeFiles: []
    };
    try {
        const resolved = path.resolve(configPath);
        if (!fs.existsSync(resolved))
            return config;
        const content = fs.readFileSync(resolved, 'utf-8');
        let currentSection = '';
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            if (trimmed.startsWith('astLock:')) {
                currentSection = 'astLock';
                continue;
            }
            if (currentSection === 'astLock') {
                if (trimmed.startsWith('enabled:')) {
                    config.enabled = trimmed.split(':')[1]?.trim() === 'true';
                }
                else if (trimmed.startsWith('lockedSymbols:')) {
                    currentSection = 'lockedSymbols';
                }
                else if (trimmed.startsWith('excludeFiles:')) {
                    currentSection = 'excludeFiles';
                }
            }
            else if (currentSection === 'lockedSymbols') {
                if (trimmed.startsWith('- ')) {
                    config.lockedSymbols.push(trimmed.slice(2).replace(/["']/g, '').trim());
                }
                else if (trimmed.includes(':')) {
                    if (trimmed.startsWith('excludeFiles:')) {
                        currentSection = 'excludeFiles';
                    }
                    else {
                        currentSection = '';
                    }
                }
            }
            else if (currentSection === 'excludeFiles') {
                if (trimmed.startsWith('- ')) {
                    config.excludeFiles.push(trimmed.slice(2).replace(/["']/g, '').trim());
                }
                else if (trimmed.includes(':')) {
                    if (trimmed.startsWith('lockedSymbols:')) {
                        currentSection = 'lockedSymbols';
                    }
                    else {
                        currentSection = '';
                    }
                }
            }
        }
    }
    catch {
        // Trả về mặc định nếu đọc lỗi
    }
    return config;
}
// ==============================================================================
// ASTLockLogger — Ghi vết ranh giới bị phá vỡ (Tác vụ 7)
// ==============================================================================
export class ASTLockLogger {
    dbPath = null;
    db = null;
    insertStmt = null;
    isInitialized = false;
    constructor(customDbPath) {
        this.dbPath = customDbPath ?? null;
    }
    async ensureDb() {
        if (this.isInitialized)
            return;
        this.isInitialized = true;
        if (!this.dbPath)
            return;
        try {
            const Database = (await import('better-sqlite3')).default;
            this.db = new Database(this.dbPath);
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS ast_lock_violations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          file_path TEXT NOT NULL,
          symbol_name TEXT NOT NULL,
          expected_hash TEXT NOT NULL,
          actual_hash TEXT NOT NULL,
          agent_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_violations_file ON ast_lock_violations(file_path);
      `);
            this.insertStmt = this.db.prepare(`
        INSERT INTO ast_lock_violations (timestamp, file_path, symbol_name, expected_hash, actual_hash, agent_id)
        VALUES (@timestamp, @filePath, @symbolName, @expectedHash, @actualHash, @agentId)
      `);
        }
        catch {
            this.db = null;
            this.insertStmt = null;
        }
    }
    async logViolation(filePath, symbolName, expectedHash, actualHash, agentId) {
        const logPath = '.ghita/ast-lock-violations.log';
        const timestamp = new Date().toISOString();
        const message = `[${timestamp}] VIOLATION in ${filePath} - Symbol '${symbolName}' changed (expected: ${expectedHash}, actual: ${actualHash})\n`;
        // Ghi vào file log tĩnh
        try {
            const dir = path.dirname(logPath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(logPath, message, 'utf8');
        }
        catch {
            // Bỏ qua nếu lỗi file
        }
        // Ghi vào SQLite nếu có
        await this.ensureDb();
        if (this.insertStmt) {
            try {
                this.insertStmt.run({
                    timestamp,
                    filePath,
                    symbolName,
                    expectedHash,
                    actualHash,
                    agentId: agentId ?? 'unknown'
                });
            }
            catch {
                // Bỏ qua lỗi insert
            }
        }
    }
}
// ==============================================================================
// ASTLockEngine — Lõi quản lý khoá chữ ký AST (Tác vụ 1, 2, 3)
// ==============================================================================
export class ASTLockEngine {
    parser;
    lockedHashes = new Map(); // key = "filePath::symbolScope"
    constructor() {
        this.parser = new PolyglotTagParser();
    }
    /**
     * Khóa danh sách các symbol trong tệp tin từ mã nguồn ban đầu
     */
    async lockSymbols(filePath, code, lang, symbolNamesToLock) {
        try {
            const tags = await this.parser.extractSymbols(code, lang);
            const hierarchy = buildHierarchy(tags);
            const definitions = hierarchy.filter(t => t.kind === 'definition');
            for (const def of definitions) {
                const shouldLock = !symbolNamesToLock || symbolNamesToLock.length === 0 || symbolNamesToLock.includes(def.scope) || symbolNamesToLock.includes(def.name);
                if (shouldLock && def.nodeText) {
                    const hash = computeSemanticHash(def.nodeText);
                    const key = `${path.resolve(filePath)}::${def.scope}`;
                    this.lockedHashes.set(key, hash);
                }
            }
        }
        catch (err) {
            console.error(`[ASTLockEngine] Failed to lock symbols for ${filePath}:`, err);
        }
    }
    /**
     * Đối soát mã nguồn mới, phát hiện ranh giới bị phá vỡ (Tác vụ 2, 5)
     */
    async validate(filePath, newCode, lang) {
        const resolvedPath = path.resolve(filePath);
        const prefix = `${resolvedPath}::`;
        const violations = [];
        // Lọc danh sách symbol bị khóa của file này
        const lockedKeys = [...this.lockedHashes.keys()].filter(k => k.startsWith(prefix));
        if (lockedKeys.length === 0) {
            return { valid: true, violations: [] };
        }
        try {
            const newTags = await this.parser.extractSymbols(newCode, lang);
            const newHierarchy = buildHierarchy(newTags);
            const newDefinitions = newHierarchy.filter(t => t.kind === 'definition');
            // Tạo map các symbol mới để đối sánh
            const newDefMap = new Map();
            for (const def of newDefinitions) {
                newDefMap.set(def.scope, def);
            }
            for (const key of lockedKeys) {
                const scope = key.slice(prefix.length);
                const expectedHash = this.lockedHashes.get(key);
                const newDef = newDefMap.get(scope);
                if (!newDef) {
                    // Symbol bị xóa hoàn toàn -> Vi phạm nghiêm trọng
                    violations.push(`AST-LOCK-001: Symbol '${scope}' bị xoá hoặc đổi tên trái phép.`);
                    continue;
                }
                if (newDef.nodeText) {
                    const actualHash = computeSemanticHash(newDef.nodeText);
                    if (expectedHash !== actualHash) {
                        violations.push(`AST-LOCK-001: Symbol '${scope}' bị sửa đè hoặc thay đổi trái phép ngoài phạm vi cho phép.`);
                    }
                }
            }
        }
        catch (err) {
            // Trường hợp lỗi parse, coi như vi phạm đề phòng rủi ro
            violations.push(`AST-LOCK-001: Không thể phân tích cú pháp AST của mã nguồn mới để thẩm định.`);
        }
        return {
            valid: violations.length === 0,
            violations
        };
    }
    /**
     * Trả về danh sách các symbol bị khóa trong bộ nhớ
     */
    getLockedSymbols() {
        return [...this.lockedHashes.keys()];
    }
    /**
     * Xóa toàn bộ trạng thái khóa
     */
    clear() {
        this.lockedHashes.clear();
    }
}
// ==============================================================================
// ASTLockMiddleware — Chốt chặn preTool cho writeFile (Tác vụ 4, 6)
// ==============================================================================
export class ASTLockMiddleware {
    name = 'ASTLockMiddleware';
    priority = 10; // Chạy sớm để chặn đứng nguy cơ sớm nhất
    engine;
    logger;
    configPath = '.ghita/rules.yaml';
    constructor(engine, customDbPath) {
        this.engine = engine ?? new ASTLockEngine();
        this.logger = new ASTLockLogger(customDbPath);
    }
    /**
     * Tự động nhận diện ngôn ngữ dựa trên phần mở rộng tệp tin
     */
    detectLanguageFromPath(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.ts': return 'typescript';
            case '.js': return 'javascript';
            case '.py': return 'python';
            case '.go': return 'go';
            case '.rs': return 'rust';
            case '.cs': return 'c_sharp';
            case '.kt':
            case '.kts': return 'kotlin';
            case '.scala': return 'scala';
            case '.pas':
            case '.pp': return 'pascal';
            default: return 'typescript'; // Fallback
        }
    }
    async preTool(toolName, args, context) {
        // Chỉ chặn các tool ghi/sửa tệp tin
        if (toolName !== 'writeFile' && toolName !== 'write_to_file' && toolName !== 'replace_file_content' && toolName !== 'multi_replace_file_content') {
            return;
        }
        const config = loadASTLockConfig(this.configPath);
        if (!config.enabled)
            return;
        // Lấy đường dẫn tệp tin từ arguments
        const filePathRaw = (args.filePath || args.filePathRaw || args.targetFile || args.TargetFile);
        if (!filePathRaw)
            return;
        const resolvedPath = path.resolve(filePathRaw);
        const normalizedPath = resolvedPath.replace(/\\/g, '/');
        // Kiểm tra tệp tin có nằm trong danh sách exclude không
        const isExcluded = config.excludeFiles.some(pattern => {
            const normalizedPattern = pattern.replace(/\*/g, '.*');
            return new RegExp(normalizedPattern).test(normalizedPath);
        });
        if (isExcluded)
            return;
        const lang = this.detectLanguageFromPath(resolvedPath);
        const newContent = (args.content || args.CodeContent || args.ReplacementContent || '');
        // Nếu tệp tin đã tồn tại, tiến hành khóa các symbol cũ của nó trước
        if (fs.existsSync(resolvedPath)) {
            try {
                const oldContent = fs.readFileSync(resolvedPath, 'utf8');
                // Khóa các symbol được chỉ định trong cấu hình rules.yaml
                // Nếu rules.yaml không cấu hình gì thì mặc định khóa tất cả symbol để bảo vệ tuyệt đối
                await this.engine.lockSymbols(resolvedPath, oldContent, lang, config.lockedSymbols);
            }
            catch (err) {
                console.warn(`[ASTLockMiddleware] Failed to lock original file ${resolvedPath}:`, err);
            }
        }
        // Tiến hành validate đối soát mã mới
        const result = await this.engine.validate(resolvedPath, newContent, lang);
        if (!result.valid) {
            const reason = result.violations.join('\n');
            // Ghi logs ranh giới bị vi phạm (Tác vụ 7)
            for (const violation of result.violations) {
                this.logger.logViolation(resolvedPath, violation, 'LOCKED', 'MODIFIED', (context.agent?.id || 'agent'));
            }
            // Chặn đứng (Tác vụ 4) và trả về mã lỗi chi tiết AST-LOCK-001 (Tác vụ 5, 6)
            return {
                proceed: false,
                reason: `[AST-LOCK ERROR] Giao dịch ghi tệp tin bị từ chối.\nLý do:\n${reason}\nVui lòng tự động rollback thay đổi, không chỉnh sửa ngoài phạm vi symbol chỉ định để bảo vệ an toàn API.`
            };
        }
        return { proceed: true };
    }
}
//# sourceMappingURL=astLock.js.map