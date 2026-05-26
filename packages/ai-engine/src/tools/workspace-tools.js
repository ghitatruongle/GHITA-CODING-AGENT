// ==============================================================================
// GHITA CODING AGENT - Workspace Operations Tools
// ==============================================================================
import * as path from 'node:path';
import * as fs from 'node:fs';
import { exec } from 'node:child_process';
// Global approval hook for terminal commands
globalThis.approveCommandHandler = globalThis.approveCommandHandler || null;
/**
 * Validates that the targeted path lies inside the workspace sandbox
 */
export function ensureInSandbox(filePath, sandboxRoot) {
    const root = sandboxRoot || globalThis.ghitaWorkspaceRoot || process.env.GHITA_WORKSPACE;
    if (!root) {
        throw new Error('No active workspace directory set. Please select a workspace folder first.');
    }
    const resolvedRoot = path.resolve(root);
    // If absolute path, resolve directly; if relative, resolve relative to resolvedRoot
    const resolvedPath = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(resolvedRoot, filePath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
        throw new Error(`Security Exception: Access denied. Path "${resolvedPath}" lies outside the active workspace sandbox "${resolvedRoot}".`);
    }
    return resolvedPath;
}
/**
 * 1. list_dir tool implementation
 */
export async function listDirectory(args) {
    const targetDir = args.path ? ensureInSandbox(args.path) : ensureInSandbox('.');
    const results = [];
    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            // Skip typical noise folders
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.turbo' || entry.name === 'build' || entry.name === '.cxx') {
                continue;
            }
            const relPath = path.relative(ensureInSandbox('.'), fullPath);
            if (entry.isDirectory()) {
                results.push({ path: relPath, isDirectory: true });
                if (args.recursive) {
                    walk(fullPath);
                }
            }
            else if (entry.isFile()) {
                const stat = fs.statSync(fullPath);
                results.push({ path: relPath, isDirectory: false, size: stat.size });
            }
        }
    }
    walk(targetDir);
    return JSON.stringify(results, null, 2);
}
/**
 * 2. read_file tool implementation
 */
export async function readFile(args) {
    const fullPath = ensureInSandbox(args.filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.filePath}`);
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${args.filePath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (args.startLine === undefined && args.endLine === undefined) {
        return content;
    }
    const lines = content.split('\n');
    const start = Math.max(1, args.startLine ?? 1);
    const end = Math.min(lines.length, args.endLine ?? lines.length);
    const extractedLines = lines.slice(start - 1, end);
    return extractedLines.join('\n');
}
/**
 * 3. write_file tool implementation
 */
export async function writeFile(args) {
    const fullPath = ensureInSandbox(args.filePath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, args.content, 'utf8');
    return `File written successfully to ${path.relative(ensureInSandbox('.'), fullPath)}`;
}
/**
 * 4. replace_file_content tool implementation
 */
export async function replaceFileContent(args) {
    const fullPath = ensureInSandbox(args.filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.filePath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes(args.targetContent)) {
        throw new Error('Target content not found in file. Please specify target content matching lines in the file exactly.');
    }
    // Verify target is unique to avoid wrong replacement
    const firstIndex = content.indexOf(args.targetContent);
    const lastIndex = content.lastIndexOf(args.targetContent);
    if (firstIndex !== lastIndex) {
        throw new Error('Multiple occurrences of target content found. Please provide a more unique target block (include surrounding lines).');
    }
    const newContent = content.substring(0, firstIndex) + args.replacementContent + content.substring(firstIndex + args.targetContent.length);
    fs.writeFileSync(fullPath, newContent, 'utf8');
    return `Successfully replaced content in ${path.relative(ensureInSandbox('.'), fullPath)}`;
}
/**
 * 5. grep_search tool implementation
 */
export async function grepSearch(args) {
    const sandbox = ensureInSandbox('.');
    const matches = [];
    function search(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.turbo' || entry.name === 'build' || entry.name === '.cxx') {
                continue;
            }
            if (entry.isDirectory()) {
                search(fullPath);
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                // Search text-like files only
                if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.md', '.txt', '.yaml', '.yml', '.toml', '.mjs', '.cjs'].includes(ext)) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes(args.query)) {
                        const lines = content.split(/\r?\n/);
                        lines.forEach((lineContent, index) => {
                            if (lineContent.includes(args.query)) {
                                matches.push({
                                    file: path.relative(sandbox, fullPath),
                                    line: index + 1,
                                    content: lineContent.trim(),
                                });
                            }
                        });
                    }
                }
            }
        }
    }
    search(sandbox);
    return JSON.stringify(matches.slice(0, 50), null, 2); // Cap matches at 50 to prevent context bloating
}
/**
 * 6. run_command tool implementation
 */
export async function runCommand(args) {
    const sandbox = ensureInSandbox('.');
    const command = args.command;
    const timeout = args.timeoutMs ?? 30000; // default 30s timeout
    // Security checks on commands
    const blockedTokens = ['rm -rf /', 'mkfs', 'dd if', 'shutdown', 'reboot', 'killall', 'format '];
    if (blockedTokens.some(token => command.includes(token))) {
        throw new Error(`Security Exception: Command "${command}" contains unsafe operations and was blocked.`);
    }
    // Check for command approval hook
    if (globalThis.approveCommandHandler) {
        const approved = await globalThis.approveCommandHandler(command);
        if (!approved) {
            throw new Error(`Permission Denied: User rejected the execution of command "${command}".`);
        }
    }
    return new Promise((resolve) => {
        exec(command, { cwd: sandbox, timeout }, (error, stdout, stderr) => {
            let output = '';
            if (stdout) {
                output += `STDOUT:\n${stdout}\n`;
            }
            if (stderr) {
                output += `STDERR:\n${stderr}\n`;
            }
            if (error) {
                if (error.killed) {
                    return resolve(`${output}ERROR: Command execution timed out after ${timeout}ms.`);
                }
                return resolve(`${output}ERROR: Command failed with code ${error.code}: ${error.message}`);
            }
            resolve(output || 'Command executed successfully with empty output.');
        });
    });
}
//# sourceMappingURL=workspace-tools.js.map