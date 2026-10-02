import type {
  AiOcrProvider,
  AiTranslationProvider,
  AiConfig,
  OcrRequest,
  TranslationRequest,
} from '../aiTypes';
import { MANHWA_OCR_SYSTEM_PROMPT, MANHWA_TRANSLATION_SYSTEM_PROMPT } from '../prompts';

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
 * Ensures clean Base URL without trailing slashes.
 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed || 'https://api.sumopod.com/v1';
}

export class SumoPodProvider implements AiOcrProvider, AiTranslationProvider {
  name = 'SumoPod';

  async recognizeText(req: OcrRequest, config: AiConfig): Promise<string> {
    const apiKey = config.sumopod?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('SumoPod API Key is required. Please set your SumoPod API key in AI Settings.');
    }

    const model = config.sumopod?.model?.trim() || 'sumopod-1.5';
    const baseUrl = normalizeBaseUrl(config.sumopod?.baseUrl || 'https://api.sumopod.com/v1');
    const imageSource = req.imageSource;

    let base64Data = '';
    if (typeof imageSource === 'string') {
      base64Data = imageSource;
    } else if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
      base64Data = imageSource.toDataURL('image/png');
    }

    if (!base64Data) {
      throw new Error('No image data provided for SumoPod OCR.');
    }

    const cleanedData = cleanBase64(base64Data);
    const mimeType = base64Data.startsWith('data:')
      ? base64Data.substring(5, base64Data.indexOf(';'))
      : 'image/png';
    const imageUrl = `data:${mimeType};base64,${cleanedData}`;

    const endpoint = `${baseUrl}/chat/completions`;

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: MANHWA_OCR_SYSTEM_PROMPT },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      throw new Error(`SumoPod OCR request failed: ${(netErr as Error).message || String(netErr)}`);
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || errJson?.message || response.statusText;
      } catch {
        errText = response.statusText;
      }

      // Check if the error is related to vision/image input unsupported
      const lowerErr = errText.toLowerCase();
      if (
        lowerErr.includes('vision') ||
        lowerErr.includes('image') ||
        lowerErr.includes('multimodal') ||
        lowerErr.includes('not supported')
      ) {
        throw new Error(
          `SumoPod OCR Error: The selected model '${model}' does not support image/vision input. Please choose a vision-capable model.`
        );
      }

      throw new Error(`SumoPod OCR API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return this.parseResponse(data, 'SumoPod OCR');
  }

  async translateText(req: TranslationRequest, config: AiConfig): Promise<string> {
    const apiKey = config.sumopod?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('SumoPod API Key is required. Please set your SumoPod API key in AI Settings.');
    }

    const textToTranslate = req.text ? req.text.trim() : '';
    if (!textToTranslate) {
      return '';
    }

    const model = config.sumopod?.model?.trim() || 'sumopod-1.5';
    const baseUrl = normalizeBaseUrl(config.sumopod?.baseUrl || 'https://api.sumopod.com/v1');
    const endpoint = `${baseUrl}/chat/completions`;

    const payload = {
      model,
      messages: [
        { role: 'system', content: MANHWA_TRANSLATION_SYSTEM_PROMPT },
        { role: 'user', content: textToTranslate },
      ],
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      throw new Error(`SumoPod Translation request failed: ${(netErr as Error).message || String(netErr)}`);
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || errJson?.message || response.statusText;
      } catch {
        errText = response.statusText;
      }
      throw new Error(`SumoPod Translation API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return this.parseResponse(data, 'SumoPod Translation');
  }

  public parseResponse(data: any, taskLabel: string): string {
    if (!data) {
      throw new Error(`${taskLabel} returned empty response`);
    }

    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error);
      throw new Error(`${taskLabel} error: ${msg}`);
    }

    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error(`${taskLabel} returned no choices in response`);
    }

    const choice = choices[0];
    const message = choice?.message;
    const content = message?.content;

    if (content === undefined || content === null) {
      throw new Error(`${taskLabel} returned undefined content`);
    }

    if (typeof content !== 'string') {
      throw new Error(`${taskLabel} returned non-string response content`);
    }

    return content.trim();
  }
}

export const sumoPodProvider = new SumoPodProvider();
