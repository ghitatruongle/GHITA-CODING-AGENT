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

  export class Uri {
    readonly fsPath: string;
    readonly scheme: string;
    readonly path: string;
    static file(path: string): Uri;
    static parse(value: string): Uri;
  }

  // --- Interfaces ---
  export interface ExtensionContext {
    subscriptions: { dispose(): unknown }[];
    workspaceState: unknown;
    globalState: unknown;
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

  export interface CancellationToken {
    isCancellationRequested: boolean;
  }

  export interface GlobPattern {
    include: string;
    exclude?: string;
  }

  // --- Namespaces ---
  export namespace commands {
    export function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
      thisArg?: unknown,
    ): { dispose(): unknown };
  }

  export namespace window {
    export function showInformationMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined>;
    export function showInformationMessage(
      message: string,
      options: { modal: boolean },
      ...items: string[]
    ): Promise<string | undefined>;
    export function showWarningMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined>;
    export function showErrorMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined>;
    export function createStatusBarItem(
      alignment: StatusBarAlignment,
      priority?: number,
    ): StatusBarItem;
    export function createOutputChannel(name: string): OutputChannel;
  }

  export namespace workspace {
    export const workspaceFolders: ReadonlyArray<WorkspaceFolder> | undefined;
    export const onDidSaveTextDocument: (listener: (document: TextDocument) => unknown) => {
      dispose(): unknown;
    };
    export const onDidCreateFiles: (listener: (event: FileCreateEvent) => unknown) => {
      dispose(): unknown;
    };
    export const onDidDeleteFiles: (listener: (event: FileDeleteEvent) => unknown) => {
      dispose(): unknown;
    };
    export const onDidRenameFiles: (listener: (event: FileRenameEvent) => unknown) => {
      dispose(): unknown;
    };
    export function getConfiguration(section?: string): {
      get<T>(section: string): T | undefined;
      get<T>(section: string, defaultValue: T): T;
    };
    export function openTextDocument(uri: { fsPath: string }): Thenable<TextDocument>;
    export function findFiles(
      include: string,
      exclude: string | null | undefined,
      maxResults?: number,
      token?: CancellationToken,
    ): Thenable<Uri[]>;
  }
}

declare module 'socket.io-client' {
  interface SocketEvents {
    connect: () => void;
    disconnect: (reason: string) => void;
    connect_error: (err: Error) => void;
    reconnect: () => void;
    reconnect_attempt: (attempt: number) => void;
    [event: string]: (...args: unknown[]) => void;
  }

  interface Socket {
    connected: boolean;
    on(event: string, listener: (...args: any[]) => void): Socket;
    once(event: string, listener: (...args: any[]) => void): Socket;
    emit(event: string, ...args: any[]): Socket;
    removeAllListeners(event?: string): Socket;
    disconnect(): void;
  }

  interface ManagerOptions {
    transports?: string[];
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    timeout?: number;
    auth?: Record<string, unknown>;
  }

  export function io(url: string, options?: ManagerOptions): Socket;
  export type { Socket };
}
