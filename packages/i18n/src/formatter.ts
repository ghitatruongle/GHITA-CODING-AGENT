// ==============================================================================
// @ghita/i18n -- ICU Formatting Utilities
// ==============================================================================

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(
  value: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatCurrency(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

export function formatPlural(count: number, locale: string, forms: Record<string, string>): string {
  const pr = new Intl.PluralRules(locale);
  const rule = pr.select(count);
  return forms[rule] ?? forms['other'] ?? '';
}
