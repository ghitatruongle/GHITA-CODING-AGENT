// ==============================================================================
// GHITA CODING AGENT - Sandbox Orphan Cleanup Utility (Weeks 7-9)
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CleanupResult {
  deletedCount: number;
  spaceReclaimedBytes: number;
  errors: string[];
}

/**
 * Quét và xóa sạch các tệp tin/thư mục sandbox mồ côi hoặc tệp tạm quá hạn (mặc định > 2 giờ)
 */
export async function cleanOrphanedSandboxFiles(
  customDirs: string[] = [],
  maxAgeMs: number = 2 * 60 * 60 * 1000, // 2 hours
  skipDefaults = false,
): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedCount: 0,
    spaceReclaimedBytes: 0,
    errors: [],
  };

  const now = Date.now();
  const targetDirs = new Set<string>();

  // 1. Thu thập các thư mục mặc định cần dọn dẹp nếu không bỏ qua
  if (!skipDefaults) {
    const osTempDir = process.env.TEMP || process.env.TMP || '/tmp';
    if (osTempDir) {
      targetDirs.add(path.resolve(osTempDir));
    }

    const localSandbox = path.resolve(process.cwd(), '.ghita', 'sandbox');
    targetDirs.add(localSandbox);
  }

  // Bổ sung các thư mục tùy chỉnh truyền vào
  for (const dir of customDirs) {
    if (dir) targetDirs.add(path.resolve(dir));
  }

  // 2. Tiến hành duyệt và xóa các file mồ côi
  for (const baseDir of targetDirs) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const stats = fs.statSync(baseDir);
      if (!stats.isDirectory()) continue;

      const items = fs.readdirSync(baseDir);
      for (const item of items) {
        const fullPath = path.join(baseDir, item);

        // Chỉ dọn dẹp các tệp/thư mục khớp với mẫu đặt tên temp của GHITA
        // hoặc các file bên trong thư mục con .ghita/sandbox
        const isGhitaTemp = item.toLowerCase().includes('ghita-');
        const isInSandboxSubfolder = baseDir.endsWith('sandbox');

        if (!isGhitaTemp && !isInSandboxSubfolder) {
          continue;
        }

        try {
          const itemStats = fs.statSync(fullPath);
          const age = now - itemStats.mtimeMs;

          if (age > maxAgeMs) {
            // Tính toán dung lượng thu hồi trước khi xóa
            const size = getDirectorySize(fullPath);

            // Xóa đệ quy tệp/thư mục
            fs.rmSync(fullPath, { recursive: true, force: true });

            result.deletedCount++;
            result.spaceReclaimedBytes += size;
          }
        } catch (itemErr: unknown) {
          result.errors.push(
            `Lỗi khi dọn dẹp tệp "${fullPath}": ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`,
          );
        }
      }
    } catch (dirErr: unknown) {
      result.errors.push(
        `Lỗi khi truy cập thư mục "${baseDir}": ${dirErr instanceof Error ? dirErr.message : String(dirErr)}`,
      );
    }
  }

  return result;
}

/**
 * Tính toán dung lượng tệp hoặc thư mục đệ quy (bytes)
 */
function getDirectorySize(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;

  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    return stats.size;
  }

  let totalSize = 0;
  if (stats.isDirectory()) {
    try {
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        totalSize += getDirectorySize(path.join(targetPath, file));
      }
    } catch {
      // Bỏ qua lỗi truy cập tệp cụ thể
    }
  }
  return totalSize;
}
