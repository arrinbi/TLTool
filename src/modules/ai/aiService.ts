import type { BoundingBox, TextRegion } from '../../types';
import type {
  AiConfig,
  OcrRequest,
  TranslationRequest,
  BatchTranslationResult,
} from './aiTypes';
import { loadAiConfig } from './aiTypes';
import { geminiProvider } from './providers/geminiProvider';
import { sumoPodProvider } from './providers/sumoPodProvider';
import { recognizeRegionText } from '../ocr/ocrService';
import { translateText as translateTextMyMemory } from '../translation/translationService';

/**
 * Utility function to crop a specific bounding box region from an image or canvas
 * and return it as a base64 PNG Data URL string.
 */
export async function cropRegionToBase64(
  imageSource: string | HTMLCanvasElement,
  bbox?: BoundingBox
): Promise<string> {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
    if (typeof imageSource === 'string') return imageSource;
    if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
      return imageSource.toDataURL('image/png');
    }
    return '';
  }

  // Handle canvas directly
  if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.max(1, Math.round(bbox.width));
    cropCanvas.height = Math.max(1, Math.round(bbox.height));
    const ctx = cropCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        imageSource,
        Math.max(0, Math.round(bbox.x)),
        Math.max(0, Math.round(bbox.y)),
        Math.max(1, Math.round(bbox.width)),
        Math.max(1, Math.round(bbox.height)),
        0,
        0,
        Math.max(1, Math.round(bbox.width)),
        Math.max(1, Math.round(bbox.height))
      );
    }
    return cropCanvas.toDataURL('image/png');
  }

  // Handle image URL string
  if (typeof imageSource === 'string') {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.max(1, Math.round(bbox.width));
        cropCanvas.height = Math.max(1, Math.round(bbox.height));
        const ctx = cropCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            img,
            Math.max(0, Math.round(bbox.x)),
            Math.max(0, Math.round(bbox.y)),
            Math.max(1, Math.round(bbox.width)),
            Math.max(1, Math.round(bbox.height)),
            0,
            0,
            Math.max(1, Math.round(bbox.width)),
            Math.max(1, Math.round(bbox.height))
          );
        }
        resolve(cropCanvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        // Fallback to original source if crop fails
        resolve(imageSource);
      };
      img.src = imageSource;
    });
  }

  return '';
}

/**
 * Primary AI OCR entry point.
 * Routes request to selected OCR provider (Tesseract fallback, Gemini, or SumoPod).
 */
export async function recognizeText(
  req: OcrRequest,
  config?: AiConfig
): Promise<string> {
  const effectiveConfig = config || loadAiConfig();
  const provider = effectiveConfig.ocrProvider;

  if (provider === 'gemini') {
    const croppedImage = await cropRegionToBase64(req.imageSource, req.bbox);
    return geminiProvider.recognizeText(
      { imageSource: croppedImage, bbox: req.bbox },
      effectiveConfig
    );
  }

  if (provider === 'sumopod') {
    const croppedImage = await cropRegionToBase64(req.imageSource, req.bbox);
    return sumoPodProvider.recognizeText(
      { imageSource: croppedImage, bbox: req.bbox },
      effectiveConfig
    );
  }

  // Default / Fallback: Tesseract OCR
  if (!req.bbox) {
    return '';
  }
  return recognizeRegionText(req.imageSource, req.bbox);
}

/**
 * Primary AI Translation entry point.
 * Routes request to selected Translation provider (MyMemory fallback, Gemini, or SumoPod).
 */
export async function translateText(
  req: TranslationRequest,
  config?: AiConfig
): Promise<string> {
  const trimmed = req.text ? req.text.trim() : '';
  if (!trimmed) {
    return '';
  }

  const effectiveConfig = config || loadAiConfig();
  const provider = effectiveConfig.translationProvider;

  if (provider === 'gemini') {
    let croppedImage = '';
    if (req.imageSource && req.bbox) {
      try {
        croppedImage = await cropRegionToBase64(req.imageSource, req.bbox);
      } catch (err) {
        console.warn('Could not crop region image for Gemini translation context:', err);
      }
    }
    return geminiProvider.translateText(
      {
        text: req.text,
        imageSource: croppedImage || undefined,
        bbox: req.bbox,
        targetLang: req.targetLang,
      },
      effectiveConfig
    );
  }

  if (provider === 'sumopod') {
    return sumoPodProvider.translateText(
      {
        text: req.text,
        imageSource: req.imageSource,
        bbox: req.bbox,
        targetLang: req.targetLang,
      },
      effectiveConfig
    );
  }

  // Default / Fallback: MyMemory / Dictionary Translation
  return translateTextMyMemory(req.text, { targetLang: req.targetLang || 'id' });
}

/**
 * Translates a single region using current AI configuration.
 */
export async function translateRegion(
  region: TextRegion,
  imageSource?: string | HTMLCanvasElement,
  config?: AiConfig
): Promise<string> {
  if (!region.text || !region.text.trim()) {
    return '';
  }

  return translateText(
    {
      text: region.text,
      imageSource,
      bbox: region.bbox,
      targetLang: 'id',
    },
    config
  );
}

/**
 * Translates all regions on a page using controlled concurrency.
 * Preserves per-region results and reports partial failures without breaking intact regions.
 */
export async function translateAllRegions(
  regions: TextRegion[],
  imageSource?: string | HTMLCanvasElement,
  config?: AiConfig,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchTranslationResult> {
  const effectiveConfig = config || loadAiConfig();
  const total = regions.length;
  let completed = 0;

  const updatedRegions: TextRegion[] = [...regions];
  const failedRegionIds: string[] = [];
  const errors: Record<string, string> = {};

  const concurrencyLimit = 3;
  const queue = regions.map((region, index) => ({ region, index }));

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { region, index } = item;

      if (!region.text || !region.text.trim()) {
        completed++;
        if (onProgress) onProgress(completed, total);
        continue;
      }

      try {
        const translated = await translateRegion(region, imageSource, effectiveConfig);
        if (translated !== undefined) {
          updatedRegions[index] = {
            ...region,
            translatedText: translated,
            translation: translated,
          };
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failedRegionIds.push(region.id);
        errors[region.id] = errMsg;
        // Keep original region text & existing translatedText intact on failure!
      } finally {
        completed++;
        if (onProgress) onProgress(completed, total);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrencyLimit, regions.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  return {
    updatedRegions,
    failedRegionIds,
    errors,
  };
}
