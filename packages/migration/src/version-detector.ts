// @ghita/migration -- Version Utilities

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}
