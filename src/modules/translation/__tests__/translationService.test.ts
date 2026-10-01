import { describe, it, expect } from 'vitest';
import {
  translateText,
  translateRegion,
  translateAllRegions,
  IndonesianTranslationModule,
} from '../translationService';
import type { TextRegion } from '../../../types';

describe('Translation Service', () => {
  it('1. translates dictionary matching text to Indonesian', async () => {
    const result = await translateText('WHAT IS THIS?!');
    expect(result).toBe('APA INI?!');
  });

  it('2. translates non-dictionary text with Indonesian prefix mock format', async () => {
    const result = await translateText('RANDOM MANHWA DIALOGUE');
    expect(result).toBe('[ID]: RANDOM MANHWA DIALOGUE');
  });

  it('3. does not translate or send requests for empty or whitespace-only text', async () => {
    const empty1 = await translateText('');
    const empty2 = await translateText('   ');
    expect(empty1).toBe('');
    expect(empty2).toBe('');
  });

  it('4. translates a single region, preserving original text and updating translatedText', async () => {
    const region: TextRegion = {
      id: 'region-1',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'THE MANHWA HAS',
      confidence: 95,
      isCleaned: false,
    };

    const translated = await translateRegion(region);
    expect(translated).toBe('MANHWA INI TELAH');
    expect(region.text).toBe('THE MANHWA HAS'); // Original text preserved
  });

  it('5. translates all regions in bulk, keeping original text and populating translatedText', async () => {
    const regions: TextRegion[] = [
      {
        id: 'r1',
        bbox: { x: 0, y: 0, width: 50, height: 20 },
        text: 'BEEN CLEANED!',
        confidence: 90,
        isCleaned: false,
      },
      {
        id: 'r2',
        bbox: { x: 0, y: 30, width: 50, height: 20 },
        text: '', // Empty OCR text
        confidence: 0,
        isCleaned: false,
      },
      {
        id: 'r3',
        bbox: { x: 0, y: 60, width: 50, height: 20 },
        text: 'HELLO',
        confidence: 99,
        isCleaned: false,
      },
    ];

    const results = await translateAllRegions(regions);

    expect(results).toHaveLength(3);
    // r1
    expect(results[0].text).toBe('BEEN CLEANED!');
    expect(results[0].translatedText).toBe('DIBERSIHKAN!');

    // r2 (empty text remains empty)
    expect(results[1].text).toBe('');
    expect(results[1].translatedText).toBeUndefined();

    // r3
    expect(results[3 - 1].text).toBe('HELLO');
    expect(results[2].translatedText).toBe('HALO');
  });

  it('6. IndonesianTranslationModule handles class method invocation', async () => {
    const module = new IndonesianTranslationModule();
    const res = await module.translateText('HELP!');
    expect(res).toBe('TOLONG!');
  });
});
