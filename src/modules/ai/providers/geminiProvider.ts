import type {
  AiOcrProvider,
  AiTranslationProvider,
  AiConfig,
  OcrRequest,
  TranslationRequest,
} from '../aiTypes';
import { MANHWA_OCR_SYSTEM_PROMPT, buildTranslationSystemPrompt } from '../prompts';

/**
 * Strips data URI header from base64 data string if present.
 */
function cleanBase64(base64Data: string): string {
  if (base64Data.includes(',')) {
    return base64Data.split(',')[1];
  }
  return base64Data;
}

/**
 * Extracts mime type from base64 data URI or defaults to 'image/png'.
 */
function getMimeType(base64Data: string): string {
  if (base64Data.startsWith('data:')) {
    const mime = base64Data.substring(5, base64Data.indexOf(';'));
    if (mime) return mime;
  }
  return 'image/png';
}

export class GeminiProvider implements AiOcrProvider, AiTranslationProvider {
  name = 'Gemini';

  async recognizeText(req: OcrRequest, config: AiConfig): Promise<string> {
    const apiKey = config.gemini?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Gemini API Key is required. Please set your Gemini API key in AI Settings.');
    }

    const model = config.gemini?.model?.trim() || 'gemini-2.5-flash';
    const imageSource = req.imageSource;

    let base64Data = '';
    if (typeof imageSource === 'string') {
      base64Data = imageSource;
    } else if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
      base64Data = imageSource.toDataURL('image/png');
    }

    if (!base64Data) {
      throw new Error('No image data provided for Gemini OCR.');
    }

    const cleanedData = cleanBase64(base64Data);
    const mimeType = getMimeType(base64Data);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: MANHWA_OCR_SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanedData,
              },
            },
          ],
        },
      ],
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      throw new Error(`Gemini OCR request failed: ${(netErr as Error).message || String(netErr)}`);
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || response.statusText;
      } catch {
        errText = response.statusText;
      }
      throw new Error(`Gemini OCR API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return this.parseResponse(data, 'Gemini OCR');
  }

  async translateText(req: TranslationRequest, config: AiConfig): Promise<string> {
    const apiKey = config.gemini?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Gemini API Key is required. Please set your Gemini API key in AI Settings.');
    }

    const textToTranslate = req.text ? req.text.trim() : '';
    if (!textToTranslate) {
      return '';
    }

    const model = config.gemini?.model?.trim() || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemPrompt = buildTranslationSystemPrompt(
      config.translationStyle,
      config.pronounStyle,
      config.customPronoun
    );
    const promptText = `${systemPrompt}\n\nText to translate:\n${textToTranslate}`;

    const parts: Array<any> = [{ text: promptText }];

    if (req.imageSource) {
      let base64Data = '';
      if (typeof req.imageSource === 'string') {
        base64Data = req.imageSource;
      } else if (typeof HTMLCanvasElement !== 'undefined' && req.imageSource instanceof HTMLCanvasElement) {
        base64Data = req.imageSource.toDataURL('image/png');
      }

      if (base64Data) {
        parts.push({
          inline_data: {
            mime_type: getMimeType(base64Data),
            data: cleanBase64(base64Data),
          },
        });
      }
    }

    const payload = {
      contents: [
        {
          parts,
        },
      ],
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      throw new Error(`Gemini Translation request failed: ${(netErr as Error).message || String(netErr)}`);
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || response.statusText;
      } catch {
        errText = response.statusText;
      }
      throw new Error(`Gemini Translation API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return this.parseResponse(data, 'Gemini Translation');
  }

  public parseResponse(data: any, taskLabel: string): string {
    if (!data) {
      throw new Error(`${taskLabel} returned empty response`);
    }

    if (data.error) {
      throw new Error(`${taskLabel} error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const candidates = data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error(`${taskLabel} returned no candidates in response`);
    }

    const candidate = candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      if (candidate.finishReason === 'SAFETY') {
        throw new Error(`${taskLabel} failed due to safety settings`);
      }
    }

    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error(`${taskLabel} returned empty content parts`);
    }

    const textPart = parts.find((p: any) => typeof p.text === 'string');
    if (!textPart || typeof textPart.text !== 'string') {
      throw new Error(`${taskLabel} returned invalid text in content parts`);
    }

    return textPart.text.trim();
  }
}

export const geminiProvider = new GeminiProvider();
