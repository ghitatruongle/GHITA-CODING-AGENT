// License classification + THIRD_PARTY_NOTICES generation for imported skills.

export type LicenseClass = 'permissive' | 'copyleft' | 'proprietary' | 'unknown';

export interface LicenseInfo {
  spdx: string;
  class: LicenseClass;
  /** True when the SkillPackImporter's MIT-compatible gate accepts it. */
  importable: boolean;
}

/** License matrix used by the import gate. */
export const LICENSE_MATRIX: Record<string, LicenseInfo> = {
  MIT: { spdx: 'MIT', class: 'permissive', importable: true },
  'MIT-0': { spdx: 'MIT-0', class: 'permissive', importable: true },
  'Apache-2.0': { spdx: 'Apache-2.0', class: 'permissive', importable: true },
  'BSD-2-Clause': { spdx: 'BSD-2-Clause', class: 'permissive', importable: true },
  'BSD-3-Clause': { spdx: 'BSD-3-Clause', class: 'permissive', importable: true },
  ISC: { spdx: 'ISC', class: 'permissive', importable: true },
  'CC0-1.0': { spdx: 'CC0-1.0', class: 'permissive', importable: true },
  Unlicense: { spdx: 'Unlicense', class: 'permissive', importable: true },
  'MPL-2.0': { spdx: 'MPL-2.0', class: 'copyleft', importable: true },
  'GPL-3.0': { spdx: 'GPL-3.0', class: 'copyleft', importable: false },
  'GPL-2.0': { spdx: 'GPL-2.0', class: 'copyleft', importable: false },
  'AGPL-3.0': { spdx: 'AGPL-3.0', class: 'copyleft', importable: false },
  Proprietary: { spdx: 'Proprietary', class: 'proprietary', importable: false },
};

/** Classify a license string (case-insensitive, tolerates version suffix). */
export function classifyLicense(raw: string | undefined): LicenseInfo {
  if (!raw) return { spdx: 'UNKNOWN', class: 'unknown', importable: false };
  const unknown: LicenseInfo = { spdx: raw.trim(), class: 'unknown', importable: false };
  const key = Object.keys(LICENSE_MATRIX).find((k) => raw.trim().toLowerCase() === k.toLowerCase());
  if (key) return LICENSE_MATRIX[key] ?? unknown;
  // Tolerate common formats: "MIT License", "Apache License 2.0", "license: Proprietary".
  const lowered = raw.toLowerCase();
  const candidates: LicenseInfo[] = [];
  if (lowered.includes('mit')) candidates.push(LICENSE_MATRIX['MIT'] ?? unknown);
  if (lowered.includes('apache')) candidates.push(LICENSE_MATRIX['Apache-2.0'] ?? unknown);
  if (lowered.includes('proprietary')) candidates.push(LICENSE_MATRIX['Proprietary'] ?? unknown);
  if (lowered.includes('unlicense')) candidates.push(LICENSE_MATRIX['Unlicense'] ?? unknown);
  return candidates[0] ?? unknown;
}

export interface NoticeEntry {
  name: string;
  license: string;
  source?: string;
}

/** Generate a THIRD_PARTY_NOTICES.md section from skill attributions. */
export function generateThirdPartyNotices(entries: readonly NoticeEntry[]): string {
  const lines: string[] = [];
  lines.push('## THIRD-PARTY NOTICES');
  lines.push('');
  lines.push('| Component | License | Source |');
  lines.push('|---|---|---|');
  for (const e of entries) {
    lines.push(`| ${e.name} | ${e.license} | ${e.source ?? '—'} |`);
  }
  lines.push('');
  lines.push(
    `License classes: ${[...new Set(entries.map((e) => classifyLicense(e.license).class))].join(', ')}.`,
  );
  return lines.join('\n');
}
