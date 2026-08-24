// @ghita/i18n -- Translation Loader Registry

import type { Locale, TranslationMessages } from './types.js';

export type TranslationLoader = (locale: Locale) => Promise<TranslationMessages>;

export class TranslationLoaderRegistry {
  private readonly loaders = new Map<Locale, TranslationLoader>();

  register(locale: Locale, loader: TranslationLoader): void {
    this.loaders.set(locale, loader);
  }

  async load(locale: Locale): Promise<TranslationMessages> {
    const loader = this.loaders.get(locale);
    if (!loader) throw new Error(`No loader registered for locale: ${locale}`);
    return loader(locale);
  }

  has(locale: Locale): boolean {
    return this.loaders.has(locale);
  }
}
