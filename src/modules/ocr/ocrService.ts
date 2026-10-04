import { createWorker, PSM } from 'tesseract.js';
import type { TextRegion, BoundingBox, RegionCategory, BubbleRegion, BubbleShape } from '../../types';

export interface OcrProgress {
  status: string;
  progress: number;
}

/**
 * Heuristically classify region category based on text content, box dimensions, and aspect ratio.
 */
export function classifyRegionCategory(bbox: BoundingBox, text: string): RegionCategory {
  const isShortText = text.trim().length <= 15 && !text.includes('\n');
  const isLargeOrWide = bbox.width > 150 || bbox.height > 60;
  const isExclamation = text.includes('!') || text.includes('?');

  if (isShortText && isLargeOrWide && isExclamation) {
    return 'sfx';
  }

  const aspectRatio = bbox.width / Math.max(1, bbox.height);
  if (aspectRatio > 0.8 && aspectRatio < 2.5) {
    return 'bubble-oval';
  } else if (aspectRatio >= 2.5) {
    return 'bubble-rect';
  }

  return 'text-outside';
}

/**
 * Helper to check if two bounding boxes overlap or are within a threshold distance of each other.
 */
export function areBoxesNear(box1: BoundingBox, box2: BoundingBox, thresholdMargin: number = 20): boolean {
  return !(
    box1.x + box1.width + thresholdMargin < box2.x ||
    box2.x + box2.width + thresholdMargin < box1.x ||
    box1.y + box1.height + thresholdMargin < box2.y ||
    box2.y + box2.height + thresholdMargin < box1.y
  );
}

/**
 * Merge an array of bounding boxes into a single enclosing bounding box.
 */
export function mergeBoxes(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export type TextUnit = {
  bbox: BoundingBox;
  text: string;
  confidence: number;
  // Optional debug metadata preserved from raw OCR output for inspection/troubleshooting
  debugMeta?: {
    lineBbox?: BoundingBox;
    paragraphBbox?: BoundingBox;
    blockBbox?: BoundingBox;
  };
};

/**
 * Checks whether a single detected TextUnit is valid or likely noise/artifact from non-text image regions.
 */
export function isValidTextUnit(unit: TextUnit): boolean {
  const text = unit.text ? unit.text.trim() : '';
  if (!text) return false;

  const { width, height } = unit.bbox;
  if (width < 3 || height < 3) return false;

  // Extreme aspect ratios (e.g., extremely long thin line art or texture artifacts)
  const aspectRatio = width / Math.max(1, height);
  if (aspectRatio > 25 || aspectRatio < 0.04) return false;

  const hasLetterOrDigit = /[a-zA-Z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(text);

  // If unit has no letters/digits (only punctuation/symbols)
  if (!hasLetterOrDigit) {
    // Check if it's common valid comic punctuation like "...", "!?", "?!", "!", "?"
    const isValidComicPunctuation = /^(\.\.\.|!\?|\?!|!|\?)+$/.test(text);
    if (!isValidComicPunctuation) {
      // Rejects line art artifacts like "---", "|||", "///", "===", "___", "~~~", ",", ".", "-", "_", etc.
      return false;
    }
    // For valid comic punctuation without letters, require decent confidence (>= 50)
    if (unit.confidence < 50) return false;
  }

  // Filter out single character low-confidence noise
  if (text.length === 1) {
    if (unit.confidence < 45) return false;
    // Single non-alphanumeric character
    if (!hasLetterOrDigit && unit.confidence < 70) return false;
  }

  // Filter out low confidence short noise
  if (unit.confidence < 30) return false;

  return true;
}

/**
 * Checks whether a clustered TextRegion represents an actual visible text area.
 */
export function isValidTextRegion(region: TextRegion): boolean {
  const text = region.text ? region.text.trim() : '';
  if (!text) return false;

  const { width, height } = region.bbox;
  if (width < 3 || height < 3) return false;

  const hasLetterOrDigit = /[a-zA-Z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(text);

  if (!hasLetterOrDigit) {
    const isValidComicPunctuation = /^(\.\.\.|!\?|\?!|!|\?|\s)+$/.test(text);
    if (!isValidComicPunctuation) return false;
    if (region.confidence < 50) return false;
  }

  if (region.confidence < 30) return false;

  return true;
}

/**
 * Extract word/line-level TextUnits from Tesseract v7 layout block hierarchy.
 * Prioritizes word-level geometry ('word.bbox') over paragraph or block geometry.
 */
export function extractTextUnitsFromBlocks(blocks?: Array<{
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  paragraphs?: Array<{
    bbox?: { x0: number; y0: number; x1: number; y1: number };
    lines?: Array<{
      bbox?: { x0: number; y0: number; x1: number; y1: number };
      text?: string;
      confidence?: number;
      words?: Array<{
        bbox: { x0: number; y0: number; x1: number; y1: number };
        text: string;
        confidence: number;
      }>;
    }>;
  }>;
}>): TextUnit[] {
  const rawUnits: TextUnit[] = [];
  if (!blocks || blocks.length === 0) return rawUnits;

  for (const block of blocks) {
    const blockBbox = block.bbox
      ? { x: block.bbox.x0, y: block.bbox.y0, width: block.bbox.x1 - block.bbox.x0, height: block.bbox.y1 - block.bbox.y0 }
      : undefined;

    if (!block.paragraphs) continue;
    for (const para of block.paragraphs) {
      const paragraphBbox = para.bbox
        ? { x: para.bbox.x0, y: para.bbox.y0, width: para.bbox.x1 - para.bbox.x0, height: para.bbox.y1 - para.bbox.y0 }
        : undefined;

      if (!para.lines) continue;
      for (const line of para.lines) {
        const lineBbox = line.bbox
          ? { x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 }
          : undefined;

        if (line.words && line.words.length > 0) {
          for (const word of line.words) {
            const text = word.text ? word.text.trim() : '';
            if (!text) continue;

            let b = word.bbox;
            // Refine word bounding box using symbol bounding boxes if available
            const wordWithSymbols = word as typeof word & {
              symbols?: Array<{ bbox?: { x0: number; y0: number; x1: number; y1: number }; text?: string }>;
            };
            if (wordWithSymbols.symbols && wordWithSymbols.symbols.length > 0) {
              let symMinX = Infinity, symMinY = Infinity, symMaxX = -Infinity, symMaxY = -Infinity;
              let hasValidSym = false;
              for (const sym of wordWithSymbols.symbols) {
                if (!sym.bbox) continue;
                if (sym.bbox.x1 > sym.bbox.x0 && sym.bbox.y1 > sym.bbox.y0) {
                  symMinX = Math.min(symMinX, sym.bbox.x0);
                  symMinY = Math.min(symMinY, sym.bbox.y0);
                  symMaxX = Math.max(symMaxX, sym.bbox.x1);
                  symMaxY = Math.max(symMaxY, sym.bbox.y1);
                  hasValidSym = true;
                }
              }
              if (hasValidSym) {
                b = { x0: symMinX, y0: symMinY, x1: symMaxX, y1: symMaxY };
              }
            }

            if (!b) continue;
            const width = b.x1 - b.x0;
            const height = b.y1 - b.y0;

            if (width < 3 || height < 3) continue;

            const unit: TextUnit = {
              bbox: { x: b.x0, y: b.y0, width, height },
              text,
              confidence: word.confidence ?? 80,
              debugMeta: {
                lineBbox,
                paragraphBbox,
                blockBbox,
              },
            };

            if (isValidTextUnit(unit)) {
              rawUnits.push(unit);
            }
          }
        } else if (line.text && line.bbox) {
          // Fallback to line box if word-level data is missing for a line
          const text = line.text.trim();
          if (text) {
            const b = line.bbox;
            const width = b.x1 - b.x0;
            const height = b.y1 - b.y0;
            if (width >= 3 && height >= 3) {
              const unit: TextUnit = {
                bbox: { x: b.x0, y: b.y0, width, height },
                text,
                confidence: line.confidence ?? 80,
                debugMeta: {
                  lineBbox,
                  paragraphBbox,
                  blockBbox,
                },
              };

              if (isValidTextUnit(unit)) {
                rawUnits.push(unit);
              }
            }
          }
        }
      }
    }
  }

  return rawUnits;
}

/**
 * Check if two text items (words/lines) belong to the same text region using adaptive vertical/horizontal proximity metrics.
 */
export function areUnitsInSameRegion(item1: TextUnit, item2: TextUnit): boolean {
  const b1 = item1.bbox;
  const b2 = item2.bbox;

  // Compute scale based on average font/box height
  const avgHeight = (b1.height + b2.height) / 2;

  // Compute center vertical distance to check if items are roughly on the same line
  const c1y = b1.y + b1.height / 2;
  const c2y = b2.y + b2.height / 2;
  const isSameLine = Math.abs(c1y - c2y) <= Math.min(b1.height, b2.height) * 0.6;

  // Adaptive thresholding:
  // Horizontally, allow up to 1.5x font height (or min 20px) on the same line, but much tighter gap across lines (0.8x font height)
  // Vertically, consecutive lines in a paragraph/bubble allow up to 1.2x font height gap (or min 18px), provided horizontal overlap exists.
  const maxHorizDist = isSameLine
    ? Math.max(avgHeight * 1.5, 20)
    : Math.max(avgHeight * 0.8, 12);
  const maxVertDist = Math.max(avgHeight * 1.2, 18);

  // Compute actual edge gaps
  const horizGap = Math.max(0, Math.max(b1.x - (b2.x + b2.width), b2.x - (b1.x + b1.width)));
  const vertGap = Math.max(0, Math.max(b1.y - (b2.y + b2.height), b2.y - (b1.y + b1.height)));

  return horizGap <= maxHorizDist && vertGap <= maxVertDist;
}

/**
 * Cluster line/word boxes into speech bubble / text regions using adaptive relative distance.
 */
export function clusterBoxes(
  items: TextUnit[],
  _legacyMargin: number = 25
): TextRegion[] {
  const validItems = items.filter(isValidTextUnit);
  if (validItems.length === 0) return [];

  const visited = new Set<number>();
  const clusters: TextRegion[] = [];

  for (let i = 0; i < validItems.length; i++) {
    if (visited.has(i)) continue;

    const currentCluster: TextUnit[] = [validItems[i]];
    visited.add(i);

    let addedNew = true;
    while (addedNew) {
      addedNew = false;
      for (let j = 0; j < validItems.length; j++) {
        if (visited.has(j)) continue;

        const candidate = validItems[j];
        const isNear = currentCluster.some((cItem) => areUnitsInSameRegion(cItem, candidate));

        if (isNear) {
          currentCluster.push(candidate);
          visited.add(j);
          addedNew = true;
        }
      }
    }

    // Sort items vertically then horizontally to re-construct readable multiline text
    currentCluster.sort((a, b) => {
      const yDiff = a.bbox.y - b.bbox.y;
      if (Math.abs(yDiff) > Math.min(a.bbox.height, b.bbox.height) * 0.6) {
        return yDiff;
      }
      return a.bbox.x - b.bbox.x;
    });

    const rawBbox = mergeBoxes(currentCluster.map((item) => item.bbox));

    // Add minimal tight padding (2px) around detected text box to fit detected text tightly
    const padding = 2;
    const combinedBbox: BoundingBox = {
      x: Math.max(0, rawBbox.x - padding),
      y: Math.max(0, rawBbox.y - padding),
      width: rawBbox.width + padding * 2,
      height: rawBbox.height + padding * 2,
    };

    // Group items into lines
    const lines: string[] = [];
    let currentLine: TextUnit[] = [];

    for (const item of currentCluster) {
      if (currentLine.length === 0) {
        currentLine.push(item);
      } else {
        const last = currentLine[currentLine.length - 1];
        if (Math.abs(item.bbox.y - last.bbox.y) <= Math.min(item.bbox.height, last.bbox.height) * 0.6) {
          currentLine.push(item);
        } else {
          lines.push(currentLine.map((w) => w.text.trim()).join(' '));
          currentLine = [item];
        }
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.map((w) => w.text.trim()).join(' '));
    }

    const combinedText = lines.join('\n');
    const avgConfidence =
      currentCluster.reduce((sum, item) => sum + item.confidence, 0) / currentCluster.length;

    const region: TextRegion = {
      id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      bbox: combinedBbox,
      text: combinedText,
      confidence: Math.round(avgConfidence),
      category: classifyRegionCategory(combinedBbox, combinedText),
      isCleaned: false,
      source: 'auto',
    };

    if (isValidTextRegion(region)) {
      clusters.push(region);
    }
  }

  return clusters;
}

export interface CanvasVariants {
  standard: HTMLCanvasElement;
  contrast: HTMLCanvasElement;
  inverted: HTMLCanvasElement;
}

function createBlankCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Canvas element creation not supported in this environment');
}

/**
 * Helper to prepare a HTMLCanvasElement from various image sources.
 */
export async function prepareCanvasFromSource(
  imageSource: string | HTMLImageElement | HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
    return imageSource;
  }

  const img = new Image();
  if (typeof imageSource === 'string') {
    img.src = imageSource;
  } else if (typeof HTMLImageElement !== 'undefined' && imageSource instanceof HTMLImageElement) {
    if (imageSource.complete && imageSource.naturalWidth) {
      const canvas = createBlankCanvas(
        imageSource.naturalWidth || imageSource.width,
        imageSource.naturalHeight || imageSource.height
      );
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(imageSource, 0, 0);
      return canvas;
    }
    img.src = imageSource.src;
  }

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  const canvas = createBlankCanvas(
    img.naturalWidth || img.width || 600,
    img.naturalHeight || img.height || 900
  );
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Detect speech bubble regions in an image independent from text recognition.
 * Bubble detection identifies bubble areas (rectangle, oval, circle) without automatically creating TextRegions.
 */
export async function detectBubbleRegions(
  imageSource: string | HTMLImageElement | HTMLCanvasElement
): Promise<BubbleRegion[]> {
  try {
    const sourceCanvas = await prepareCanvasFromSource(imageSource);
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return [];

    const { width, height } = sourceCanvas;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Detect uniform white/light regions (speech bubble candidates)
    const visited = new Uint8Array(width * height);
    const bubbles: BubbleRegion[] = [];

    // Step down resolution for fast scanning
    const step = 4;
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const idx = (y * width + x) * 4;
        const pos = y * width + x;
        if (visited[pos]) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Speech bubble interior candidate pixel (high luminance, low saturation)
        if (lum > 220 && Math.max(r, g, b) - Math.min(r, g, b) < 25) {
          // BFS to measure bounding box of light patch
          let minX = x, maxX = x, minY = y, maxY = y;
          const queue = [pos];
          visited[pos] = 1;

          let count = 0;
          let qHead = 0;
          while (qHead < queue.length && count < 50000) {
            const curr = queue[qHead++];
            count++;
            const cx = curr % width;
            const cy = Math.floor(curr / width);

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            const nbs = [
              [cx + step, cy],
              [cx - step, cy],
              [cx, cy + step],
              [cx, cy - step],
            ];

            for (const [nx, ny] of nbs) {
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nPos = ny * width + nx;
                if (!visited[nPos]) {
                  const nIdx = nPos * 4;
                  const nr = data[nIdx];
                  const ng = data[nIdx + 1];
                  const nb = data[nIdx + 2];
                  const nLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

                  if (nLum > 200 && Math.max(nr, ng, nb) - Math.min(nr, ng, nb) < 30) {
                    visited[nPos] = 1;
                    queue.push(nPos);
                  }
                }
              }
            }
          }

          const bWidth = maxX - minX + 1;
          const bHeight = maxY - minY + 1;

          // Require reasonable speech bubble dimensions (e.g. min 30x20, max 90% page)
          if (
            bWidth >= 30 &&
            bHeight >= 20 &&
            bWidth < width * 0.9 &&
            bHeight < height * 0.9 &&
            count >= 20
          ) {
            const aspectRatio = bWidth / Math.max(1, bHeight);
            let shape: BubbleShape = 'oval';
            if (aspectRatio > 0.85 && aspectRatio < 1.15) {
              shape = 'circle';
            } else if (aspectRatio >= 2.2 || aspectRatio <= 0.45) {
              shape = 'rectangle';
            }

            const bbox: BoundingBox = {
              x: minX,
              y: minY,
              width: bWidth,
              height: bHeight,
            };

            // Avoid duplicate overlapping bubbles
            const isDuplicate = bubbles.some(
              (b) => computeOverlapRatio(b.bbox, bbox) > 0.4
            );

            if (!isDuplicate) {
              bubbles.push({
                id: `bubble-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                shape,
                bbox,
                confidence: 90,
              });
            }
          }
        }
      }
    }

    return bubbles;
  } catch (err) {
    console.warn('Bubble detection error:', err);
    return [];
  }
}

/**
 * Associate text regions with speech bubbles when bounding boxes overlap.
 */
export function associateTextWithBubbles(
  regions: TextRegion[],
  bubbles: BubbleRegion[]
): TextRegion[] {
  if (bubbles.length === 0) return regions;

  return regions.map((region) => {
    const matchingBubble = bubbles.find(
      (b) => computeOverlapRatio(region.bbox, b.bbox) > 0.3
    );
    if (matchingBubble) {
      return {
        ...region,
        bubbleId: matchingBubble.id,
      };
    }
    return region;
  });
}

/**
 * Deduplicate or update text regions when running Re-OCR or new detection.
 * Stable region IDs are updated with new text/confidence or replaced when spatially overlapping,
 * preventing duplicate regions from accumulating on the same area.
 */
export function deduplicateOrUpdateRegions(
  existingRegions: TextRegion[],
  newRegions: TextRegion[],
  overlapThreshold: number = 0.45
): TextRegion[] {
  const result = [...existingRegions];

  for (const candidate of newRegions) {
    let matchedIndex = -1;

    // First check exact ID match
    matchedIndex = result.findIndex((r) => r.id === candidate.id);

    // If no exact ID match, check spatial overlap
    if (matchedIndex < 0) {
      matchedIndex = result.findIndex(
        (r) => computeOverlapRatio(r.bbox, candidate.bbox) >= overlapThreshold
      );
    }

    if (matchedIndex >= 0) {
      // Update existing region in-place while preserving region ID, cleaning state, and manual flags
      const existing = result[matchedIndex];
      result[matchedIndex] = {
        ...existing,
        text: candidate.text || existing.text,
        confidence: candidate.confidence || existing.confidence,
        bbox: candidate.bbox || existing.bbox,
        category: candidate.category || existing.category,
        bubbleId: candidate.bubbleId || existing.bubbleId,
      };
    } else {
      // Append non-duplicate new region
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Preprocess image canvas into variants optimized for different manhwa text types:
 * - standard: Pristine canvas for dark text on light background.
 * - contrast: Background-lightened pass converting dark panel artwork to white so Tesseract cleanly isolates speech bubbles.
 * - inverted: Inverted high-contrast canvas for white/light SFX and wild text over dark artwork.
 */
export function preprocessCanvasVariants(sourceCanvas: HTMLCanvasElement): CanvasVariants {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // 1. Standard canvas
  const standardCanvas = createBlankCanvas(width, height);
  const stdCtx = standardCanvas.getContext('2d');
  if (stdCtx) stdCtx.drawImage(sourceCanvas, 0, 0);

  // 2. Lightened Background / Speech Bubble Pass
  const contrastCanvas = createBlankCanvas(width, height);
  const cCtx = contrastCanvas.getContext('2d');
  if (cCtx) {
    cCtx.drawImage(sourceCanvas, 0, 0);
    const cImgData = cCtx.getImageData(0, 0, width, height);
    const d = cImgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Lighten panel artwork background pixels while preserving dark speech bubble text
      if (lum > 20 && lum < 190) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
      }
    }
    cCtx.putImageData(cImgData, 0, 0);
  }

  // 3. Inverted Canvas (for white/light SFX and wild text over dark panels)
  const invertedCanvas = createBlankCanvas(width, height);
  const invCtx = invertedCanvas.getContext('2d');
  if (invCtx) {
    invCtx.drawImage(sourceCanvas, 0, 0);
    const invImgData = invCtx.getImageData(0, 0, width, height);
    const d = invImgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const invVal = Math.min(255, Math.max(0, (255 - lum - 128) * 1.5 + 128));
      d[i] = invVal;
      d[i + 1] = invVal;
      d[i + 2] = invVal;
    }
    invCtx.putImageData(invImgData, 0, 0);
  }

  return {
    standard: standardCanvas,
    contrast: contrastCanvas,
    inverted: invertedCanvas,
  };
}

/**
 * Compute spatial overlap ratio relative to the smaller bounding box area.
 */
export function computeOverlapRatio(b1: BoundingBox, b2: BoundingBox): number {
  const x1 = Math.max(b1.x, b2.x);
  const y1 = Math.max(b1.y, b2.y);
  const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
  const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

  const interWidth = Math.max(0, x2 - x1);
  const interHeight = Math.max(0, y2 - y1);
  const interArea = interWidth * interHeight;

  if (interArea <= 0) return 0;

  const area1 = b1.width * b1.height;
  const area2 = b2.width * b2.height;

  return interArea / Math.min(area1, area2);
}

/**
 * Deduplicate TextUnits from multi-pass OCR detections.
 * Filters out low-confidence noise and combines spatially overlapping units.
 */
export function deduplicateTextUnits(units: TextUnit[]): TextUnit[] {
  if (units.length === 0) return [];

  // Sort units by confidence descending
  const sorted = [...units].sort((a, b) => b.confidence - a.confidence);
  const result: TextUnit[] = [];

  for (const candidate of sorted) {
    if (!isValidTextUnit(candidate)) {
      continue;
    }

    let isDuplicate = false;
    for (const existing of result) {
      const overlap = computeOverlapRatio(candidate.bbox, existing.bbox);
      if (overlap > 0.35) {
        isDuplicate = true;
        // If candidate has much higher confidence or richer/longer text, update existing text/confidence
        if (candidate.confidence > existing.confidence + 15 || candidate.text.length > existing.text.length + 3) {
          existing.text = candidate.text;
          existing.confidence = Math.max(existing.confidence, candidate.confidence);
          if (candidate.bbox.width * candidate.bbox.height < existing.bbox.width * existing.bbox.height) {
            existing.bbox = candidate.bbox;
          }
        }
        break;
      }
    }

    if (!isDuplicate) {
      result.push({ ...candidate });
    }
  }

  return result;
}

/**
 * Primary OCR & Detection runner.
 */
export async function detectTextRegions(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  onProgress?: (progress: OcrProgress) => void
): Promise<TextRegion[]> {
  try {
    if (onProgress) onProgress({ status: 'Preparing canvas and image passes...', progress: 0.1 });

    const sourceCanvas = await prepareCanvasFromSource(imageSource);
    const variants = preprocessCanvasVariants(sourceCanvas);

    if (onProgress) onProgress({ status: 'Initializing OCR Engine...', progress: 0.2 });

    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    const allRawUnits: TextUnit[] = [];

    // Pass 1: Standard Pass
    if (onProgress) onProgress({ status: 'Analyzing standard speech bubble text...', progress: 0.35 });
    const retStd = await worker.recognize(variants.standard, {}, { blocks: true });
    const dataStd = retStd.data as { blocks?: Array<any> };
    allRawUnits.push(...extractTextUnitsFromBlocks(dataStd.blocks));

    // Pass 2: Contrast-Enhanced Pass
    if (onProgress) onProgress({ status: 'Analyzing low-contrast text regions...', progress: 0.55 });
    const retContrast = await worker.recognize(variants.contrast, {}, { blocks: true });
    const dataContrast = retContrast.data as { blocks?: Array<any> };
    allRawUnits.push(...extractTextUnitsFromBlocks(dataContrast.blocks));

    // Pass 3: Inverted Pass (for white SFX and wild text over dark artwork)
    if (onProgress) onProgress({ status: 'Analyzing stylized SFX and wild text...', progress: 0.75 });
    const retInv = await worker.recognize(variants.inverted, {}, { blocks: true });
    const dataInv = retInv.data as { blocks?: Array<any> };
    allRawUnits.push(...extractTextUnitsFromBlocks(dataInv.blocks));

    await worker.terminate();

    if (onProgress) onProgress({ status: 'Deduplicating and clustering text regions...', progress: 0.90 });

    const deduplicated = deduplicateTextUnits(allRawUnits);
    const regions = clusterBoxes(deduplicated);

    if (onProgress) onProgress({ status: 'Done', progress: 1.0 });

    return regions;
  } catch (err) {
    console.warn('Tesseract OCR error or worker fallback:', err);
    return [];
  }
}

/**
 * Helper to safely create a reusable Tesseract OCR worker.
 */
export async function createOcrWorker(): Promise<any> {
  try {
    return await createWorker('eng');
  } catch (err) {
    console.warn('Failed to create OCR worker:', err);
    return null;
  }
}

/**
 * Re-run OCR on a specific bounding box region of an image.
 */
export async function recognizeRegionText(
  imageSource: string | HTMLCanvasElement,
  bbox: BoundingBox,
  worker?: any
): Promise<string> {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
    return '';
  }

  let createdWorker = false;
  try {
    let tesseractWorker = worker;
    if (!tesseractWorker) {
      tesseractWorker = await createWorker('eng');
      createdWorker = true;
    }

    const rectangle = {
      left: Math.max(0, Math.round(bbox.x)),
      top: Math.max(0, Math.round(bbox.y)),
      width: Math.max(1, Math.round(bbox.width)),
      height: Math.max(1, Math.round(bbox.height)),
    };

    const ret = await tesseractWorker.recognize(imageSource, { rectangle });

    if (createdWorker) {
      await tesseractWorker.terminate();
    }

    return ret.data?.text ? ret.data.text.trim() : '';
  } catch (err) {
    console.error('Failed to recognize region text:', err);
    return '';
  }
}
