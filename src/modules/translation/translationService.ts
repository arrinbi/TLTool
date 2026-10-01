import type { TextRegion } from '../../types';

export interface TranslationServiceOptions {
  sourceLang?: string;
  targetLang: string;
}

/**
 * Common comic phrase translation dictionary for Indonesian MVP translation service.
 */
const INDONESIAN_DICTIONARY: Record<string, string> = {
  'WHAT IS THIS?!': 'APA INI?!',
  'WHAT IS THIS?': 'APA INI?',
  'WHAT IS THIS': 'APA INI',
  'THE MANHWA HAS': 'MANHWA INI TELAH',
  'BEEN CLEANED!': 'DIBERSIHKAN!',
  'BEEN CLEANED': 'DIBERSIHKAN',
  'HELLO': 'HALO',
  'YES': 'YA',
  'NO': 'TIDAK',
  'THANK YOU': 'TERIMA KASIH',
  'HELP!': 'TOLONG!',
  'WHAT?': 'APA?',
  'WHY?': 'KENAPA?',
  'HUH?': 'HAP?',
  'DAMN IT!': 'SIALAN!',
  'DAMN': 'SIAL',
};

/**
 * Translates text into Indonesian (or specified target language).
 * Does not send requests for empty or whitespace-only text.
 */
export async function translateText(
  text: string,
  options: TranslationServiceOptions = { targetLang: 'id' }
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  // Check dictionary exact match (case-insensitive key lookup)
  const upperKey = trimmed.toUpperCase();
  if (INDONESIAN_DICTIONARY[upperKey]) {
    return INDONESIAN_DICTIONARY[upperKey];
  }

  const source = options.sourceLang || 'autodetect';
  const target = options.targetLang || 'id';
  const langpair = `${source}|${target}`;

  const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${encodeURIComponent(langpair)}`;

  let response: Response;
  try {
    response = await fetch(apiUrl);
  } catch (netErr) {
    throw new Error(`Translation API request failed: ${(netErr as Error).message || String(netErr)}`);
  }

  if (!response.ok) {
    throw new Error(`Translation API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data?.responseStatus !== 200 && data?.responseStatus !== '200') {
    const detail = data?.responseDetails || 'Unknown error from translation provider';
    throw new Error(`Translation failed: ${detail}`);
  }

  const translatedText = data?.responseData?.translatedText;
  if (!translatedText || typeof translatedText !== 'string') {
    throw new Error('Translation API returned empty or invalid response');
  }

  // Match original casing if input was all uppercase
  const isUppercase = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  return isUppercase ? translatedText.toUpperCase() : translatedText;
}

/**
 * Modular interface for Translation engine.
 * Future extension: Integration with DeepL, OpenAI, or Custom LLM APIs.
 */
export interface TranslationModule {
  translateText(text: string, options?: TranslationServiceOptions): Promise<string>;
  translateRegion(region: TextRegion, options?: TranslationServiceOptions): Promise<string>;
  translatePage(regions: TextRegion[], options?: TranslationServiceOptions): Promise<TextRegion[]>;
}

export class IndonesianTranslationModule implements TranslationModule {
  async translateText(
    text: string,
    options: TranslationServiceOptions = { targetLang: 'id' }
  ): Promise<string> {
    return translateText(text, options);
  }

  async translateRegion(
    region: TextRegion,
    options: TranslationServiceOptions = { targetLang: 'id' }
  ): Promise<string> {
    if (!region.text || !region.text.trim()) {
      return '';
    }
    return translateText(region.text, options);
  }

  async translatePage(
    regions: TextRegion[],
    options: TranslationServiceOptions = { targetLang: 'id' }
  ): Promise<TextRegion[]> {
    return Promise.all(
      regions.map(async (r) => {
        if (!r.text || !r.text.trim()) {
          return r;
        }
        const translated = await this.translateRegion(r, options);
        return {
          ...r,
          translatedText: translated,
          translation: translated, // preserve backwards compatibility placeholder
        };
      })
    );
  }
}

export const translationModule = new IndonesianTranslationModule();

export async function translateRegion(
  region: TextRegion,
  options: TranslationServiceOptions = { targetLang: 'id' }
): Promise<string> {
  return translationModule.translateRegion(region, options);
}

export async function translateAllRegions(
  regions: TextRegion[],
  options: TranslationServiceOptions = { targetLang: 'id' }
): Promise<TextRegion[]> {
  return translationModule.translatePage(regions, options);
}
