import type { TextRegion, BoundingBox } from '../../types';
import { ensureFontLoaded } from './fontService';

export interface TypesettingStyle {
  x: number;
  y: number;
  bounds?: BoundingBox;
  padding: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  align: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
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
  padding: 4,
  fontFamily: 'sans-serif',
  fontSize: 16,
  fontWeight: 'normal',
  color: '#000000',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.2,
};

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

/**
 * Returns the effective typesetting box bounds for a region.
 * Defaults to the OCR bounding box if no custom typesetting bounds are defined.
 */
export function getEffectiveTypesettingBounds(region: TextRegion): BoundingBox {
  if (region.typesetting?.bounds) {
    return { ...region.typesetting.bounds };
  }
  const x = region.bbox.x + (region.typesetting?.x || 0);
  const y = region.bbox.y + (region.typesetting?.y || 0);
  return {
    x,
    y,
    width: region.bbox.width,
    height: region.bbox.height,
  };
}

/**
 * Resolves the effective typesetting style for a given region,
 * applying default font family fallback if no region-specific font is set.
 */
export function getEffectiveTypesettingStyle(
  region: TextRegion,
  defaultFontFamily?: string
): TypesettingStyle {
  const align = region.typesetting?.align ?? (region.category === 'text-outside' ? 'left' : 'center');
  const vAlign = region.typesetting?.vAlign ?? 'middle';
  const fallbackFont = defaultFontFamily || DEFAULT_TYPESETTING_STYLE.fontFamily;
  const bounds = getEffectiveTypesettingBounds(region);
  const padding = region.typesetting?.padding ?? DEFAULT_TYPESETTING_STYLE.padding;

  return {
    x: region.typesetting?.x ?? 0,
    y: region.typesetting?.y ?? 0,
    bounds,
    padding,
    fontFamily: region.typesetting?.fontFamily ?? fallbackFont,
    fontSize: region.typesetting?.fontSize ?? DEFAULT_TYPESETTING_STYLE.fontSize,
    fontWeight: region.typesetting?.fontWeight ?? DEFAULT_TYPESETTING_STYLE.fontWeight,
    color: region.typesetting?.color ?? DEFAULT_TYPESETTING_STYLE.color,
    align,
    vAlign,
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
 * Measures line width using Canvas 2D context or character heuristic fallback.
 */
export function measureTextLineWidth(
  str: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string = 'normal',
  ctx?: CanvasRenderingContext2D | null
): number {
  if (!str) return 0;
  let tempCtx = ctx;
  if (!tempCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    tempCtx = canvas.getContext('2d');
  }
  if (tempCtx) {
    tempCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = tempCtx.measureText(str);
    if (metrics && typeof metrics.width === 'number') {
      return metrics.width;
    }
  }
  return str.length * (fontSize * 0.55);
}

export interface RenderedTextDetails {
  bounds: BoundingBox;
  padding: number;
  innerBounds: BoundingBox;
  lines: string[];
  fontSize: number;
  lineSpacing: number;
  totalTextHeight: number;
  maxLineWidth: number;
  textBlockBounds: BoundingBox;
  boxCenter: { x: number; y: number };
  textCenter: { x: number; y: number };
  alignmentStatus: 'Centered' | 'Almost centered' | 'Needs adjustment';
  isHorizontallyCentered: boolean;
  isVerticallyCentered: boolean;
}

/**
 * Computes detailed layout and text block centering geometry for alignment checks.
 */
export function getRenderedTextDetails(
  region: TextRegion,
  overrideStyle?: Partial<TypesettingStyle>,
  defaultFontFamily?: string,
  ctx?: CanvasRenderingContext2D | null
): RenderedTextDetails {
  const style = {
    ...getEffectiveTypesettingStyle(region, defaultFontFamily),
    ...overrideStyle,
  };

  const bounds = style.bounds || getEffectiveTypesettingBounds(region);
  const padding = style.padding ?? 4;

  const innerX = bounds.x + padding;
  const innerY = bounds.y + padding;
  const innerWidth = Math.max(10, bounds.width - padding * 2);
  const innerHeight = Math.max(10, bounds.height - padding * 2);
  const innerBounds: BoundingBox = { x: innerX, y: innerY, width: innerWidth, height: innerHeight };

  const { fontSize, lines } = getRegionTypesettingLayout(region, overrideStyle, defaultFontFamily, ctx);
  const lineSpacing = fontSize * style.lineHeight;
  const totalTextHeight = lines.length * lineSpacing;

  let maxLineWidth = 0;
  for (const line of lines) {
    const lw = measureTextLineWidth(line, fontSize, style.fontFamily, style.fontWeight, ctx);
    if (lw > maxLineWidth) maxLineWidth = lw;
  }

  // Vertical position of text block top
  let textBlockTopY = innerY;
  if (style.vAlign === 'top') {
    textBlockTopY = innerY;
  } else if (style.vAlign === 'bottom') {
    textBlockTopY = innerY + innerHeight - totalTextHeight;
  } else {
    // 'middle' / 'center'
    textBlockTopY = innerY + (innerHeight - totalTextHeight) / 2;
  }

  // Horizontal position of text block left
  let textBlockLeftX = innerX;
  if (style.align === 'left') {
    textBlockLeftX = innerX;
  } else if (style.align === 'right') {
    textBlockLeftX = innerX + innerWidth - maxLineWidth;
  } else {
    // 'center'
    textBlockLeftX = innerX + (innerWidth - maxLineWidth) / 2;
  }

  const textBlockBounds: BoundingBox = {
    x: textBlockLeftX,
    y: textBlockTopY,
    width: maxLineWidth,
    height: totalTextHeight,
  };

  const boxCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  const textCenter = {
    x: textBlockLeftX + maxLineWidth / 2,
    y: textBlockTopY + totalTextHeight / 2,
  };

  const diffX = Math.abs(textCenter.x - boxCenter.x);
  const diffY = Math.abs(textCenter.y - boxCenter.y);

  const TOLERANCE_CENTERED = 3;
  const TOLERANCE_ALMOST = 10;

  const isHorizontallyCentered = diffX <= TOLERANCE_CENTERED;
  const isVerticallyCentered = diffY <= TOLERANCE_CENTERED;

  let alignmentStatus: 'Centered' | 'Almost centered' | 'Needs adjustment' = 'Needs adjustment';
  if (isHorizontallyCentered && isVerticallyCentered) {
    alignmentStatus = 'Centered';
  } else if (diffX <= TOLERANCE_ALMOST && diffY <= TOLERANCE_ALMOST) {
    alignmentStatus = 'Almost centered';
  }

  return {
    bounds,
    padding,
    innerBounds,
    lines,
    fontSize,
    lineSpacing,
    totalTextHeight,
    maxLineWidth,
    textBlockBounds,
    boxCenter,
    textCenter,
    alignmentStatus,
    isHorizontallyCentered,
    isVerticallyCentered,
  };
}

/**
 * Calculates optimal font size and wrapped lines for a typesetting box.
 */
export function calculateAutoFontSize(
  region: TextRegion,
  text: string,
  style: TypesettingStyle,
  ctx?: CanvasRenderingContext2D | null
): { fontSize: number; lines: string[] } {
  const bounds = style.bounds || getEffectiveTypesettingBounds(region);
  const padding = style.padding ?? 4;

  const maxWidth = Math.max(10, bounds.width - padding * 2);
  const maxHeight = Math.max(10, bounds.height - padding * 2);

  let startFontSize = Math.min(Math.floor(maxHeight * 0.5), 36);
  if (text.length > 50) startFontSize = Math.min(startFontSize, 24);
  if (text.length > 100) startFontSize = Math.min(startFontSize, 18);
  startFontSize = Math.max(startFontSize, MIN_FONT_SIZE);

  let bestFontSize = startFontSize;
  let bestLines: string[] = [];

  for (let fontSize = startFontSize; fontSize >= MIN_FONT_SIZE; fontSize--) {
    const lines = wrapText(text, maxWidth, style.fontFamily, fontSize, style.fontWeight, ctx);
    const lineSpacing = fontSize * style.lineHeight;
    const totalHeight = lines.length * lineSpacing;

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

interface TypesettingLayoutCacheItem {
  fontSize: number;
  lines: string[];
}

const typesettingLayoutCache = new Map<string, TypesettingLayoutCacheItem>();
const MAX_CACHE_SIZE = 500;

export function clearTypesettingLayoutCache(): void {
  typesettingLayoutCache.clear();
}

/**
 * Computes or retrieves cached typesetting layout (fontSize and wrapped lines) for a region.
 */
export function getRegionTypesettingLayout(
  region: TextRegion,
  overrideStyle?: Partial<TypesettingStyle>,
  defaultFontFamily?: string,
  ctx?: CanvasRenderingContext2D | null
): { fontSize: number; lines: string[] } {
  const textToRender = region.translatedText || region.translation;
  if (!textToRender || !textToRender.trim() || !region.bbox || region.bbox.width <= 0 || region.bbox.height <= 0) {
    return { fontSize: 0, lines: [] };
  }

  const style = {
    ...getEffectiveTypesettingStyle(region, defaultFontFamily),
    ...overrideStyle,
  };

  const bounds = style.bounds || getEffectiveTypesettingBounds(region);
  const padding = style.padding ?? 4;
  const userFontSize = region.typesetting?.fontSize;

  const cacheKey = [
    textToRender,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    padding,
    style.fontFamily,
    userFontSize || 'auto',
    style.fontSize,
    style.fontWeight,
    style.lineHeight,
    style.align,
    style.vAlign,
  ].join('|');

  const cached = typesettingLayoutCache.get(cacheKey);
  if (cached) {
    return { fontSize: cached.fontSize, lines: cached.lines };
  }

  let fontSize = style.fontSize;
  let lines: string[] = [];

  if (!userFontSize) {
    // Auto calculate if user hasn't explicitly set a custom font size
    const autoFit = calculateAutoFontSize(region, textToRender, style, ctx);
    fontSize = autoFit.fontSize;
    lines = autoFit.lines;
  } else {
    const maxWidth = Math.max(10, bounds.width - padding * 2);
    lines = wrapText(textToRender, maxWidth, style.fontFamily, fontSize, style.fontWeight, ctx);
  }

  if (typesettingLayoutCache.size >= MAX_CACHE_SIZE) {
    const firstKey = typesettingLayoutCache.keys().next().value;
    if (firstKey !== undefined) typesettingLayoutCache.delete(firstKey);
  }

  typesettingLayoutCache.set(cacheKey, { fontSize, lines });
  return { fontSize, lines };
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

  const style = {
    ...getEffectiveTypesettingStyle(region, defaultFontFamily),
    ...overrideStyle,
  };

  const bounds = style.bounds || getEffectiveTypesettingBounds(region);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const { fontSize, lines } = getRegionTypesettingLayout(region, overrideStyle, defaultFontFamily, ctx);

  if (lines.length === 0 || fontSize <= 0) return;

  ctx.save();
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'middle';

  const lineSpacing = fontSize * style.lineHeight;
  const totalTextHeight = lines.length * lineSpacing;

  const padding = style.padding;
  const innerX = bounds.x + padding;
  const innerY = bounds.y + padding;
  const innerWidth = Math.max(10, bounds.width - padding * 2);
  const innerHeight = Math.max(10, bounds.height - padding * 2);

  // Vertical alignment
  let startY: number;
  if (style.vAlign === 'top') {
    startY = innerY + lineSpacing / 2;
  } else if (style.vAlign === 'bottom') {
    startY = innerY + innerHeight - totalTextHeight + lineSpacing / 2;
  } else {
    // 'middle' / 'center'
    startY = innerY + innerHeight / 2 - totalTextHeight / 2 + lineSpacing / 2;
  }

  // Horizontal alignment
  let alignX: number;
  if (style.align === 'left') {
    alignX = innerX;
  } else if (style.align === 'right') {
    alignX = innerX + innerWidth;
  } else {
    // 'center'
    alignX = innerX + innerWidth / 2;
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
