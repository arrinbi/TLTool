import type { TextRegion } from '../../types';

export interface TranslationServiceOptions {
  sourceLang?: string;
  targetLang: string;
}

/**
 * Modular interface for Translation engine.
 * Future extension: Integration with DeepL, OpenAI, or Custom LLM APIs.
 */
export interface TranslationModule {
  translateRegion(region: TextRegion, options: TranslationServiceOptions): Promise<string>;
  translatePage(regions: TextRegion[], options: TranslationServiceOptions): Promise<TextRegion[]>;
}

export class StubTranslationModule implements TranslationModule {
  async translateRegion(region: TextRegion, _options: TranslationServiceOptions): Promise<string> {
    // Stub placeholder response
    return `[Translated]: ${region.text}`;
  }

  async translatePage(regions: TextRegion[], options: TranslationServiceOptions): Promise<TextRegion[]> {
    return Promise.all(
      regions.map(async (r) => ({
        ...r,
        translation: await this.translateRegion(r, options),
      }))
    );
  }
}

export const translationModule = new StubTranslationModule();
