declare global {
    var ghitaWorkspaceRoot: string | undefined;
    var approveCommandHandler: ((command: string) => Promise<boolean>) | null;
}
/**
 * Validates that the targeted path lies inside the workspace sandbox
 */
export declare function ensureInSandbox(filePath: string, sandboxRoot?: string): string;
/**
 * 1. list_dir tool implementation
 */
export declare function listDirectory(args: {
    recursive?: boolean;
    path?: string;
}): Promise<string>;
/**
 * 2. read_file tool implementation
 */
export declare function readFile(args: {
    filePath: string;
    startLine?: number;
    endLine?: number;
}): Promise<string>;
/**
 * 3. write_file tool implementation
 */
export declare function writeFile(args: {
    filePath: string;
    content: string;
}): Promise<string>;
/**
 * 4. replace_file_content tool implementation
 */
export declare function replaceFileContent(args: {
    filePath: string;
    targetContent: string;
    replacementContent: string;
}): Promise<string>;
/**
 * 5. grep_search tool implementation
 */
export declare function grepSearch(args: {
    query: string;
}): Promise<string>;
/**
 * 6. run_command tool implementation
 */
export declare function runCommand(args: {
    command: string;
    timeoutMs?: number;
}): Promise<string>;
//# sourceMappingURL=workspace-tools.d.ts.map