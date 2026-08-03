// ==============================================================================
// GHITA CODING AGENT — Native filesystem access (frontend wrapper)
// ==============================================================================
// These calls go through the Rust-side native fs commands (std::fs), which are
// NOT subject to the Tauri plugin-fs scope. This is what lets the file explorer
// and code editor open/edit files in ANY folder the user navigates to, without
// the silent "read failed" / "save failed" errors caused by the restricted
// $DOCUMENT/$DESKTOP/$DOWNLOAD scope.

import { invoke } from '@tauri-apps/api/core';

export interface NativeFsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface NativeFsMetadata {
  isDirectory: boolean;
  size: number;
  modifiedMs: number;
}

export interface NativeFsReadText {
  content: string;
  encoding: string; // 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'latin-1'
  isBinary: boolean;
  /** True when the file exceeded the read cap and content is incomplete. */
  isTruncated: boolean;
}

/** Default cap for reading a file into the editor (5 MiB). */
export const NATIVE_FS_READ_CAP = 5 * 1024 * 1024;

/** Manually set to true in tests / non-Tauri environments to use plugin-fs. */
export async function fsReadDir(path: string): Promise<NativeFsEntry[]> {
  return invoke<NativeFsEntry[]>('fs_read_dir', { path });
}

export async function fsReadText(path: string, maxBytes?: number): Promise<NativeFsReadText> {
  return invoke<NativeFsReadText>('fs_read_text', {
    path,
    maxBytes: maxBytes ?? NATIVE_FS_READ_CAP,
  });
}

export async function fsWriteText(
  path: string,
  content: string,
  encoding?: string | null,
): Promise<void> {
  return invoke<void>('fs_write_text', {
    path,
    content,
    encoding: encoding || null,
  });
}

export async function fsMetadata(path: string): Promise<NativeFsMetadata> {
  return invoke<NativeFsMetadata>('fs_metadata', { path });
}

export async function fsMkdir(path: string, recursive?: boolean): Promise<void> {
  return invoke<void>('fs_mkdir', { path, recursive: recursive ?? false });
}

export async function fsRemove(path: string, recursive?: boolean): Promise<void> {
  return invoke<void>('fs_remove', { path, recursive: recursive ?? false });
}

export async function fsRename(from: string, to: string): Promise<void> {
  return invoke<void>('fs_rename', { from, to });
}
