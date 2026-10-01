import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  translateText,
  translateRegion,
  translateAllRegions,
  IndonesianTranslationModule,
} from '../translationService';
import type { TextRegion } from '../../../types';

describe('Translation Service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. translates dictionary matching text to Indonesian without external network calls', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await translateText('WHAT IS THIS?!');
    expect(result).toBe('APA INI?!');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('2. translates non-dictionary text via MyMemory translation API and preserves uppercase format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responseData: {
          translatedText: 'Saya pasti akan mendapatkan tempat dengan lift.',
        },
        responseStatus: 200,
      }),
    });
    globalThis.fetch = mockFetch as any;

    const input = "I'LL BE SURE TO GET A PLACE WITH AN ELEVATOR.";
    const result = await translateText(input);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain('https://api.mymemory.translated.net/get?q=');
    expect(requestedUrl).toContain('langpair=autodetect%7Cid');
    expect(result).toBe('SAYA PASTI AKAN MENDAPATKAN TEMPAT DENGAN LIFT.');
  });

  it('3. does not translate or send requests for empty or whitespace-only text', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const empty1 = await translateText('');
    const empty2 = await translateText('   ');
    expect(empty1).toBe('');
    expect(empty2).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('4. throws clear error when translation API fails or returns error status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responseData: null,
        responseStatus: 403,
        responseDetails: 'Quota exceeded',
      }),
    });
    globalThis.fetch = mockFetch as any;

    await expect(translateText('SOME UNTRANSLATED DIALOGUE')).rejects.toThrow(
      'Translation failed: Quota exceeded'
    );
  });

  it('5. translates a single region, preserving original text and updating translatedText', async () => {
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

  it('6. translates all regions in bulk, keeping original text and populating translatedText', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responseData: {
          translatedText: 'Dialog baru',
        },
        responseStatus: 200,
      }),
    });
    globalThis.fetch = mockFetch as any;

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
        text: 'New Dialogue',
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
    expect(results[2].text).toBe('New Dialogue');
    expect(results[2].translatedText).toBe('Dialog baru');
  });

  it('7. IndonesianTranslationModule handles class method invocation', async () => {
    const module = new IndonesianTranslationModule();
    const res = await module.translateText('HELP!');
    expect(res).toBe('TOLONG!');
  });
});
