import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TextRegion } from '../../../types';
import type { AiConfig } from '../aiTypes';
import { loadAiConfig, saveAiConfig, DEFAULT_AI_CONFIG } from '../aiTypes';
import { GeminiProvider, geminiProvider } from '../providers/geminiProvider';
import { SumoPodProvider, sumoPodProvider } from '../providers/sumoPodProvider';
import { recognizeText, translateText, translateRegion, translateAllRegions } from '../aiService';

// Mock global fetch
const globalFetch = globalThis.fetch;

describe('AI Module & Provider Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    globalThis.fetch = globalFetch;
  });

  describe('AiTypes & LocalStorage Configuration', () => {
    it('returns default AI config when localStorage is empty', () => {
      const config = loadAiConfig();
      expect(config.ocrProvider).toBe('tesseract');
      expect(config.translationProvider).toBe('mymemory');
      expect(config.gemini.model).toBe('gemini-2.5-flash');
      expect(config.sumopod.baseUrl).toBe('https://api.sumopod.com/v1');
    });

    it('saves and loads AI config from localStorage', () => {
      const customConfig: AiConfig = {
        ocrProvider: 'gemini',
        translationProvider: 'sumopod',
        gemini: { apiKey: 'test-gemini-key', model: 'gemini-1.5-pro' },
        sumopod: { apiKey: 'test-sumopod-key', baseUrl: 'https://custom.sumopod.com/v1', model: 'sumopod-v2' },
      };

      saveAiConfig(customConfig);
      const loaded = loadAiConfig();

      expect(loaded.ocrProvider).toBe('gemini');
      expect(loaded.translationProvider).toBe('sumopod');
      expect(loaded.gemini.apiKey).toBe('test-gemini-key');
      expect(loaded.sumopod.baseUrl).toBe('https://custom.sumopod.com/v1');
    });
  });

  describe('Gemini Provider Response Parsing & Requests', () => {
    it('parses valid Gemini API response', () => {
      const provider = new GeminiProvider();
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Halo Dunia!' }],
            },
            finishReason: 'STOP',
          },
        ],
      };

      const result = provider.parseResponse(mockResponse, 'Gemini Test');
      expect(result).toBe('Halo Dunia!');
    });

    it('throws error on missing API key for Gemini OCR', async () => {
      const provider = new GeminiProvider();
      const emptyConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        ocrProvider: 'gemini',
        gemini: { apiKey: '', model: 'gemini-2.5-flash' },
      };

      await expect(
        provider.recognizeText({ imageSource: 'data:image/png;base64,ABC' }, emptyConfig)
      ).rejects.toThrow('Gemini API Key is required');
    });

    it('throws error on missing API key for Gemini Translation', async () => {
      const provider = new GeminiProvider();
      const emptyConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        translationProvider: 'gemini',
        gemini: { apiKey: '', model: 'gemini-2.5-flash' },
      };

      await expect(
        provider.translateText({ text: 'Hello' }, emptyConfig)
      ).rejects.toThrow('Gemini API Key is required');
    });

    it('handles Gemini API error response structure', () => {
      const provider = new GeminiProvider();
      const mockErrorResponse = {
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
        },
      };

      expect(() => provider.parseResponse(mockErrorResponse, 'Gemini Test')).toThrow(
        'Gemini Test error: API key not valid'
      );
    });

    it('handles Gemini safety block finish reason', () => {
      const provider = new GeminiProvider();
      const mockSafetyResponse = {
        candidates: [
          {
            finishReason: 'SAFETY',
          },
        ],
      };

      expect(() => provider.parseResponse(mockSafetyResponse, 'Gemini Test')).toThrow(
        'Gemini Test failed due to safety settings'
      );
    });

    it('makes correct fetch request for Gemini Translation', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'APA INI?!' }] },
            },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const testConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        gemini: { apiKey: 'dummy-gemini-key', model: 'gemini-2.5-flash' },
      };

      const result = await geminiProvider.translateText({ text: 'WHAT IS THIS?!' }, testConfig);
      expect(result).toBe('APA INI?!');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=dummy-gemini-key');
      const body = JSON.parse(callArgs[1].body);
      expect(body.contents[0].parts[0].text).toContain('WHAT IS THIS?!');
    });
  });

  describe('SumoPod Provider Response Parsing & Requests', () => {
    it('parses valid SumoPod OpenAI-style response', () => {
      const provider = new SumoPodProvider();
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Sialan!',
            },
          },
        ],
      };

      const result = provider.parseResponse(mockResponse, 'SumoPod Test');
      expect(result).toBe('Sialan!');
    });

    it('throws error on missing API key for SumoPod Translation', async () => {
      const provider = new SumoPodProvider();
      const emptyConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        translationProvider: 'sumopod',
        sumopod: { apiKey: '', baseUrl: 'https://api.sumopod.com/v1', model: 'sumopod-1.5' },
      };

      await expect(
        provider.translateText({ text: 'Damn it!' }, emptyConfig)
      ).rejects.toThrow('SumoPod API Key is required');
    });

    it('throws clear error when SumoPod model does not support vision for OCR', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Model sumopod-text-only does not support image input or vision modal',
          },
        }),
      });
      globalThis.fetch = mockFetch;

      const testConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        ocrProvider: 'sumopod',
        sumopod: {
          apiKey: 'dummy-key',
          baseUrl: 'https://api.sumopod.com/v1',
          model: 'sumopod-text-only',
        },
      };

      await expect(
        sumoPodProvider.recognizeText({ imageSource: 'data:image/png;base64,1234' }, testConfig)
      ).rejects.toThrow(/does not support image\/vision input/);
    });

    it('makes correct fetch request for SumoPod Translation', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { content: 'HALO' },
            },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const testConfig: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        sumopod: { apiKey: 'sumo-secret-key', baseUrl: 'https://api.sumopod.com/v1', model: 'sumopod-1.5' },
      };

      const result = await sumoPodProvider.translateText({ text: 'HELLO' }, testConfig);
      expect(result).toBe('HALO');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.sumopod.com/v1/chat/completions');
      expect(callArgs[1].headers.Authorization).toBe('Bearer sumo-secret-key');
    });
  });

  describe('AI Service Orchestration & Provider Selection', () => {
    it('routes recognizeText to Gemini when gemini is selected', async () => {
      const spy = vi.spyOn(geminiProvider, 'recognizeText').mockResolvedValue('RECOGNIZED BY GEMINI');

      const config: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        ocrProvider: 'gemini',
      };

      const result = await recognizeText({ imageSource: 'data:image/png;base64,ABC' }, config);
      expect(result).toBe('RECOGNIZED BY GEMINI');
      expect(spy).toHaveBeenCalled();
    });

    it('routes translateText to SumoPod when sumopod is selected', async () => {
      const spy = vi.spyOn(sumoPodProvider, 'translateText').mockResolvedValue('DITERJEMAHKAN OLEH SUMOPOD');

      const config: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        translationProvider: 'sumopod',
      };

      const result = await translateText({ text: 'TRANSLATE ME' }, config);
      expect(result).toBe('DITERJEMAHKAN OLEH SUMOPOD');
      expect(spy).toHaveBeenCalled();
    });

    it('preserves region text and updates translatedText only during translateRegion', async () => {
      vi.spyOn(geminiProvider, 'translateText').mockResolvedValue('APA INI?!');

      const config: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        translationProvider: 'gemini',
      };

      const region: TextRegion = {
        id: 'r1',
        bbox: { x: 10, y: 10, width: 100, height: 50 },
        text: 'WHAT IS THIS?!',
        confidence: 90,
        isCleaned: false,
      };

      const translated = await translateRegion(region, undefined, config);
      expect(translated).toBe('APA INI?!');

      // Original text field must never be modified by translation
      expect(region.text).toBe('WHAT IS THIS?!');
    });
  });

  describe('translateAllRegions Concurrency & Partial Failure', () => {
    it('translates all regions using batch processing and reports failed regions without corrupting intact ones', async () => {
      const regions: TextRegion[] = [
        { id: 'r1', bbox: { x: 0, y: 0, width: 10, height: 10 }, text: 'HELLO', confidence: 90, isCleaned: false },
        { id: 'r2', bbox: { x: 0, y: 0, width: 10, height: 10 }, text: 'FAIL_ME', confidence: 90, isCleaned: false },
        { id: 'r3', bbox: { x: 0, y: 0, width: 10, height: 10 }, text: 'THANK YOU', confidence: 90, isCleaned: false },
      ];

      vi.spyOn(geminiProvider, 'translateText').mockImplementation(async (req) => {
        if (req.text === 'FAIL_ME') {
          throw new Error('API Rate limit exceeded for r2');
        }
        if (req.text === 'HELLO') return 'HALO';
        if (req.text === 'THANK YOU') return 'TERIMA KASIH';
        return 'TRANSLATED';
      });

      const config: AiConfig = {
        ...DEFAULT_AI_CONFIG,
        translationProvider: 'gemini',
      };

      const batchResult = await translateAllRegions(regions, undefined, config);

      expect(batchResult.updatedRegions[0].translatedText).toBe('HALO');
      expect(batchResult.updatedRegions[0].text).toBe('HELLO'); // OCR text intact

      // Region 2 failed: translatedText should be undefined, original text intact
      expect(batchResult.updatedRegions[1].translatedText).toBeUndefined();
      expect(batchResult.updatedRegions[1].text).toBe('FAIL_ME');

      expect(batchResult.updatedRegions[2].translatedText).toBe('TERIMA KASIH');
      expect(batchResult.updatedRegions[2].text).toBe('THANK YOU');

      expect(batchResult.failedRegionIds).toEqual(['r2']);
      expect(batchResult.errors['r2']).toContain('API Rate limit exceeded for r2');
    });
  });

  describe('Security & Secrets Scan', () => {
    it('verifies that default configuration contains no hardcoded API keys or secrets', () => {
      expect(DEFAULT_AI_CONFIG.gemini.apiKey).toBe('');
      expect(DEFAULT_AI_CONFIG.sumopod.apiKey).toBe('');
    });
  });
});
