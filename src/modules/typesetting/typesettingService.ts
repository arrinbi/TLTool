import type { TextRegion } from '../../types';
import { ensureFontLoaded } from './fontService';

export interface TypesettingStyle {
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export const AVAILABLE_FONTS = [
  { label: 'Sans-Serif (Default)', value: 'sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
];

export const DEFAULT_TYPESETTING_STYLE: TypesettingStyle = {
  x: 0,
  y: 0,
  fontFamily: 'sans-serif',
  fontSize: 16,
  fontWeight: 'normal',
  color: '#000000',
  align: 'center',
  lineHeight: 1.2,
};

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

/**
 * Resolves the effective typesetting style for a given region,
 * applying default font family fallback if no region-specific font is set.
 */
export function getEffectiveTypesettingStyle(
  region: TextRegion,
  defaultFontFamily?: string
): TypesettingStyle {
  const align = region.typesetting?.align ?? (region.category === 'text-outside' ? 'left' : 'center');
  const fallbackFont = defaultFontFamily || DEFAULT_TYPESETTING_STYLE.fontFamily;

  return {
    x: region.typesetting?.x ?? 0,
    y: region.typesetting?.y ?? 0,
    fontFamily: region.typesetting?.fontFamily ?? fallbackFont,
    fontSize: region.typesetting?.fontSize ?? DEFAULT_TYPESETTING_STYLE.fontSize,
    fontWeight: region.typesetting?.fontWeight ?? DEFAULT_TYPESETTING_STYLE.fontWeight,
    color: region.typesetting?.color ?? DEFAULT_TYPESETTING_STYLE.color,
    align,
    lineHeight: region.typesetting?.lineHeight ?? DEFAULT_TYPESETTING_STYLE.lineHeight,
  };
}

/**
 * Wraps text into multiple lines fitting within maxWidth given font settings using Canvas 2D text measurement.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number | string = 'normal',
  ctx?: CanvasRenderingContext2D | null
): string[] {
  const cleanText = text.trim();
  if (!cleanText) return [];

  // Create temporary canvas context for measurement if none provided
  let tempCtx = ctx;
  if (!tempCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    tempCtx = canvas.getContext('2d');
  }

  if (tempCtx) {
    tempCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  }

  // Helper measure width function
  const measure = (str: string): number => {
    if (tempCtx && typeof tempCtx.measureText === 'function') {
      const metrics = tempCtx.measureText(str);
      if (metrics && typeof metrics.width === 'number') {
        return metrics.width;
      }
    }
    // Fallback heuristic if canvas context not available (e.g. headless node test)
    return str.length * (fontSize * 0.55);
  };

  // If text already has explicit newlines, respect them first
  const explicitLines = cleanText.split('\n');
  const finalLines: string[] = [];

  for (const expLine of explicitLines) {
    const words = expLine.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === '')) continue;

    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      if (measure(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        finalLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      finalLines.push(currentLine);
    }
  }

  return finalLines;
}

/**
 * Calculates optimal font size and wrapped lines for a region bbox.
 */
export function calculateAutoFontSize(
  region: TextRegion,
  text: string,
  style: TypesettingStyle,
  ctx?: CanvasRenderingContext2D | null
): { fontSize: number; lines: string[] } {
  const { width: boxWidth, height: boxHeight } = region.bbox;

  // Add small padding inside bbox
  const paddingX = Math.max(4, boxWidth * 0.05);
  const paddingY = Math.max(4, boxHeight * 0.05);
  const maxWidth = Math.max(10, boxWidth - paddingX * 2);
  const maxHeight = Math.max(10, boxHeight - paddingY * 2);

  // Initial estimate based on box height and text length
  let startFontSize = Math.min(Math.floor(boxHeight * 0.5), 36);
  if (text.length > 50) startFontSize = Math.min(startFontSize, 20);
  if (text.length > 100) startFontSize = Math.min(startFontSize, 16);
  startFontSize = Math.max(startFontSize, MIN_FONT_SIZE);

  let bestFontSize = startFontSize;
  let bestLines: string[] = [];

  for (let fontSize = startFontSize; fontSize >= MIN_FONT_SIZE; fontSize--) {
    const lines = wrapText(text, maxWidth, style.fontFamily, fontSize, style.fontWeight, ctx);
    const lineSpacing = fontSize * style.lineHeight;
    const totalHeight = lines.length * lineSpacing;

    // Check if lines fit within height and width
    if (totalHeight <= maxHeight) {
      bestFontSize = fontSize;
      bestLines = lines;
      break;
    }

    bestFontSize = fontSize;
    bestLines = lines;
  }

  if (bestLines.length === 0) {
    bestLines = [text];
  }

  return { fontSize: bestFontSize, lines: bestLines };
}

/**
 * Renders translated text for a region onto a Canvas 2D context.
 */
export function renderRegionTypesetting(
  ctx: CanvasRenderingContext2D,
  region: TextRegion,
  overrideStyle?: Partial<TypesettingStyle>,
  defaultFontFamily?: string
): void {
  const textToRender = region.translatedText || region.translation;
  if (!textToRender || !textToRender.trim()) return;

  if (!region.bbox || region.bbox.width <= 0 || region.bbox.height <= 0) return;

  const style = {
    ...getEffectiveTypesettingStyle(region, defaultFontFamily),
    ...overrideStyle,
  };

  // Determine lines & font size
  let fontSize = style.fontSize;
  let lines: string[] = [];

  if (!region.typesetting?.fontSize) {
    // Auto calculate if user hasn't explicitly set a custom font size
    const autoFit = calculateAutoFontSize(region, textToRender, style, ctx);
    fontSize = autoFit.fontSize;
    lines = autoFit.lines;
  } else {
    const maxWidth = Math.max(10, region.bbox.width - 8);
    lines = wrapText(textToRender, maxWidth, style.fontFamily, fontSize, style.fontWeight, ctx);
  }

  if (lines.length === 0) return;

  ctx.save();
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'middle';

  const lineSpacing = fontSize * style.lineHeight;
  const totalTextHeight = lines.length * lineSpacing;

  // Center vertical position within region bbox plus offset
  const boxCenterX = region.bbox.x + region.bbox.width / 2 + style.x;
  const boxCenterY = region.bbox.y + region.bbox.height / 2 + style.y;

  // Starting Y for top line
  const startY = boxCenterY - totalTextHeight / 2 + lineSpacing / 2;

  let alignX = boxCenterX;
  if (style.align === 'left') {
    alignX = region.bbox.x + 4 + style.x;
  } else if (style.align === 'right') {
    alignX = region.bbox.x + region.bbox.width - 4 + style.x;
  }

  lines.forEach((line, index) => {
    const yPos = startY + index * lineSpacing;
    ctx.fillText(line, alignX, yPos);
  });

  ctx.restore();
}

/**
 * Non-destructive final renderer that renders all translated text regions onto a copy of the cleaned image,
 * preserving actual pristine original image pixel dimensions.
 */
export async function renderTypesetImage(
  cleanedUrl: string,
  regions: TextRegion[],
  defaultFontFamily?: string
): Promise<string> {
  // Pre-load required custom fonts before canvas drawing
  for (const region of regions) {
    const style = getEffectiveTypesettingStyle(region, defaultFontFamily);
    if (style.fontFamily) {
      await ensureFontLoaded(style.fontFamily);
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2d context for typesetting render'));
          return;
        }

        // 1. Draw pristine cleaned image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. Render each valid translated region
        for (const region of regions) {
          const translatedText = region.translatedText || region.translation;
          if (!translatedText || !translatedText.trim()) continue;
          if (!region.bbox || region.bbox.width <= 0 || region.bbox.height <= 0) continue;

          renderRegionTypesetting(ctx, region, undefined, defaultFontFamily);
        }

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load cleaned image for typesetting export'));
    };

    img.src = cleanedUrl;
  });
}

/**
 * Legacy interface implementation for backwards compatibility
 */
export interface TypesettingModule {
  applyTypesetting(
    ctx: CanvasRenderingContext2D,
    region: TextRegion,
    style: TypesettingStyle
  ): Promise<void>;
}

export class DefaultTypesettingModule implements TypesettingModule {
  async applyTypesetting(
    ctx: CanvasRenderingContext2D,
    region: TextRegion,
    style: TypesettingStyle
  ): Promise<void> {
    renderRegionTypesetting(ctx, region, style);
  }
}

export const typesettingModule = new DefaultTypesettingModule();
