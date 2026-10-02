import type { BoundingBox, TextRegion } from '../../types';

export type OcrProviderType = 'tesseract' | 'gemini' | 'sumopod';
export type TranslationProviderType = 'mymemory' | 'gemini' | 'sumopod';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export interface SumoPodConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiConfig {
  ocrProvider: OcrProviderType;
  translationProvider: TranslationProviderType;
  gemini: GeminiConfig;
  sumopod: SumoPodConfig;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  ocrProvider: 'tesseract',
  translationProvider: 'mymemory',
  gemini: {
    apiKey: '',
    model: 'gemini-2.5-flash',
  },
  sumopod: {
    apiKey: '',
    baseUrl: 'https://api.sumopod.com/v1',
    model: 'sumopod-1.5',
  },
};

const AI_CONFIG_STORAGE_KEY = 'tltool_ai_config';

export function loadAiConfig(): AiConfig {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_AI_CONFIG };
  }

  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ocrProvider: parsed.ocrProvider || DEFAULT_AI_CONFIG.ocrProvider,
      translationProvider: parsed.translationProvider || DEFAULT_AI_CONFIG.translationProvider,
      gemini: {
        apiKey: parsed.gemini?.apiKey || '',
        model: parsed.gemini?.model || DEFAULT_AI_CONFIG.gemini.model,
      },
      sumopod: {
        apiKey: parsed.sumopod?.apiKey || '',
        baseUrl: parsed.sumopod?.baseUrl || DEFAULT_AI_CONFIG.sumopod.baseUrl,
        model: parsed.sumopod?.model || DEFAULT_AI_CONFIG.sumopod.model,
      },
    };
  } catch (err) {
    console.warn('Failed to load AI config from localStorage, using defaults:', err);
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function saveAiConfig(config: AiConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save AI config to localStorage:', err);
  }
}

export interface OcrRequest {
  imageSource: string | HTMLCanvasElement;
  bbox?: BoundingBox;
}

export interface TranslationRequest {
  text: string;
  imageSource?: string | HTMLCanvasElement;
  bbox?: BoundingBox;
  targetLang?: string;
}

export interface AiOcrProvider {
  name: string;
  recognizeText(req: OcrRequest, config: AiConfig): Promise<string>;
}

export interface AiTranslationProvider {
  name: string;
  translateText(req: TranslationRequest, config: AiConfig): Promise<string>;
}

export interface BatchTranslationResult {
  updatedRegions: TextRegion[];
  failedRegionIds: string[];
  errors: Record<string, string>;
}
