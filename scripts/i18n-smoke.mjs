// Smoke test: verify all 6 locales have same translation structure
import { en } from '../apps/desktop/src/i18n/en.ts';
import { vi } from '../apps/desktop/src/i18n/vi.ts';
import { zh } from '../apps/desktop/src/i18n/zh.ts';
import { ru } from '../apps/desktop/src/i18n/ru.ts';
import { ja } from '../apps/desktop/src/i18n/ja.ts';
import { ko } from '../apps/desktop/src/i18n/ko.ts';

const locales = { en, vi, zh, ru, ja, ko };
const newNamespaces = ['notification', 'voice', 'monitoring', 'quota', 'codeGraph'];

let totalStrings = 0;
let allOk = true;

for (const ns of newNamespaces) {
  const enNs = en[ns];
  const enKeys = Object.keys(enNs).sort();
  totalStrings += enKeys.length;

  for (const [name, loc] of Object.entries(locales)) {
    const locNs = loc[ns];
    if (!locNs) {
      console.error(`❌ ${name} missing namespace ${ns}`);
      allOk = false;
      continue;
    }
    const locKeys = Object.keys(locNs).sort();
    const missing = enKeys.filter(k => !locKeys.includes(k));
    if (missing.length > 0) {
      console.error(`❌ ${name}.${ns} missing keys: ${missing.join(', ')}`);
      allOk = false;
    }
  }
}

if (allOk) {
  console.log(`✅ All 6 locales × 5 namespaces have complete translations`);
  console.log(`   ${totalStrings} strings × 6 locales = ${totalStrings * 6} translations`);
  console.log(`   Strings per namespace: ${Math.round(totalStrings / 5)} avg`);
}
