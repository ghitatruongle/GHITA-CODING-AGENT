declare module 'vscode' {
  export interface ExtensionContext {
    subscriptions: { dispose(): any }[];
    workspaceState: any;
    globalState: any;
    extensionPath: string;
    asAbsolutePath(relativePath: string): string;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): { dispose(): any };
  }

  export namespace window {
    export interface StatusBarItem {
      text: string;
      tooltip: string | undefined;
      command: string | undefined;
      show(): void;
      hide(): void;
      dispose(): void;
    }

    export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
    export function createStatusBarItem(alignment?: number, priority?: number): StatusBarItem;
  }

  export namespace workspace {
    export interface TextDocument {
      uri: { fsPath: string };
      fileName: string;
      getText(): string;
    }

    export interface TextDocumentChangeEvent {
      document: TextDocument;
    }

    export const onDidChangeTextDocument: (listener: (e: TextDocumentChangeEvent) => any) => { dispose(): any };
    export const onDidSaveTextDocument: (listener: (document: TextDocument) => any) => { dispose(): any };

    export function getConfiguration(section?: string): {
      get<T>(section: string): T | undefined;
      get<T>(section: string, defaultValue: T): T;
    };
  }
}
