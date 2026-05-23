// ==============================================================================
// GHITA CODING AGENT - Built-in Tools Registry
// ==============================================================================

import { WebSearchTool } from './web-search.js';
import { WebFetchTool } from './web-fetch.js';
import {
  listDirectory,
  readFile,
  writeFile,
  replaceFileContent,
  grepSearch,
  runCommand,
} from './workspace-tools.js';

export { WebSearchTool } from './web-search.js';
export type { SearchResult, SearchResponse } from './web-search.js';
export { WebFetchTool } from './web-fetch.js';
export type { FetchResponse } from './web-fetch.js';
export * from './workspace-tools.js';

/** Built-in tool definitions cho AI function calling */
export interface BuiltInTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** Tạo built-in tools registry */
export function createBuiltInTools(): BuiltInTool[] {
  const webSearch = new WebSearchTool();
  const webFetch = new WebFetchTool();

  return [
    {
      name: 'web_search',
      description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results (default 5)', default: 5 },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = String(args.query ?? '');
        const maxResults = Number(args.maxResults ?? 5);
        const result = await webSearch.search(query, maxResults);
        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch content from a URL. Returns the page content as text/markdown.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        const url = String(args.url ?? '');
        const result = await webFetch.fetch(url);
        return `Title: ${result.title}\nURL: ${result.url}\nStatus: ${result.statusCode}\n\n${result.content}`;
      },
    },
    {
      name: 'list_dir',
      description: 'List all files and directories recursively or non-recursively inside the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path of directory to list (optional, default is workspace root)' },
          recursive: { type: 'boolean', description: 'Whether to list subdirectories recursively (optional, default is false)' },
        },
      },
      execute: async (args) => {
        const pathParam = args.path !== undefined ? String(args.path) : undefined;
        const recursive = args.recursive === true;
        return await listDirectory({ path: pathParam, recursive });
      },
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file inside the workspace sandbox, optionally specifying a line range.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file to read' },
          startLine: { type: 'number', description: '1-indexed starting line to read (optional)' },
          endLine: { type: 'number', description: '1-indexed ending line to read (inclusive, optional)' },
        },
        required: ['filePath'],
      },
      execute: async (args) => {
        const filePath = String(args.filePath);
        const startLine = args.startLine !== undefined ? Number(args.startLine) : undefined;
        const endLine = args.endLine !== undefined ? Number(args.endLine) : undefined;
        return await readFile({ filePath, startLine, endLine });
      },
    },
    {
      name: 'write_file',
      description: 'Write complete contents to a new or existing file inside the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file to write' },
          content: { type: 'string', description: 'The complete string content to write' },
        },
        required: ['filePath', 'content'],
      },
      execute: async (args) => {
        const filePath = String(args.filePath);
        const content = String(args.content);
        return await writeFile({ filePath, content });
      },
    },
    {
      name: 'replace_file_content',
      description: 'Replace a single contiguous unique block of lines in an existing file inside the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file' },
          targetContent: { type: 'string', description: 'The precise lines of code in the file to be replaced' },
          replacementContent: { type: 'string', description: 'The complete replacement lines of code' },
        },
        required: ['filePath', 'targetContent', 'replacementContent'],
      },
      execute: async (args) => {
        const filePath = String(args.filePath);
        const targetContent = String(args.targetContent);
        const replacementContent = String(args.replacementContent);
        return await replaceFileContent({ filePath, targetContent, replacementContent });
      },
    },
    {
      name: 'grep_search',
      description: 'Find occurrences of a text query across all supported files in the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The exact string/substring to look for' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = String(args.query);
        return await grepSearch({ query });
      },
    },
    {
      name: 'run_command',
      description: 'Execute a terminal shell command inside the workspace sandbox with safety guardrails.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The terminal command to run' },
          timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds (optional, default is 30000)' },
        },
        required: ['command'],
      },
      execute: async (args) => {
        const command = String(args.command);
        const timeoutMs = args.timeoutMs !== undefined ? Number(args.timeoutMs) : undefined;
        return await runCommand({ command, timeoutMs });
      },
    },
  ];
}
