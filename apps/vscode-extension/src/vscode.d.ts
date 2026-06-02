declare module 'vscode' {
  // --- Enums ---
  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  // --- Classes ---
  export class ThemeColor {
    constructor(id: string);
  }

  // --- Interfaces ---
  export interface ExtensionContext {
    subscriptions: { dispose()
: unknown }[];
    workspaceState
: unknown;
    globalState
: unknown;
    extensionPath: string;
    asAbsolutePath(relativePath: string): string;
  }

  export interface TextDocument {
    uri: { fsPath: string };
    fileName: string;
    getText(): string;
    languageId: string;
  }

  export interface StatusBarItem {
    text: string;
    tooltip: string | undefined;
    command: string | undefined;
    backgroundColor: ThemeColor | undefined;
    show(): void;
    hide(): void;
    dispose(): void;
  }

  export interface OutputChannel {
    appendLine(value: string): void;
    dispose(): void;
  }

  export interface WorkspaceFolder {
    uri: { fsPath: string };
    name: string;
    index: number;
  }

  export interface FileCreateEvent {
    readonly files: ReadonlyArray<{ fsPath: string }>;
  }

  export interface FileDeleteEvent {
    readonly files: ReadonlyArray<{ fsPath: string }>;
  }

  export interface FileRenameEvent {
    readonly files: ReadonlyArray<{ oldUri: { fsPath: string }; newUri: { fsPath: string } }>;
  }

  // --- Namespaces ---
  export namespace commands {
    export function registerCommand(command: string, callback: (...args
: unknown[]) => any, thisArg?
: unknown): { dispose()
: unknown };
  }

  export namespace window {
    export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function createStatusBarItem(alignment: StatusBarAlignment, priority?: number): StatusBarItem;
    export function createOutputChannel(name: string): OutputChannel;
  }

  export namespace workspace {
    export const workspaceFolders: ReadonlyArray<WorkspaceFolder> | undefined;
    export const onDidSaveTextDocument: (listener: (document: TextDocument) => any) => { dispose()
: unknown };
    export const onDidCreateFiles: (listener: (event: FileCreateEvent) => any) => { dispose()
: unknown };
    export const onDidDeleteFiles: (listener: (event: FileDeleteEvent) => any) => { dispose()
: unknown };
    export const onDidRenameFiles: (listener: (event: FileRenameEvent) => any) => { dispose()
: unknown };
    export function getConfiguration(section?: string): {
      get<T>(section: string): T | undefined;
      get<T>(section: string, defaultValue: T): T;
    };
    export function openTextDocument(uri: { fsPath: string }): Thenable<TextDocument>;
  }
}
