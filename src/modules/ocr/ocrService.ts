import { createWorker, PSM } from 'tesseract.js';
import type { TextRegion, BoundingBox } from '../../types';

import type { RegionCategory } from '../../types';

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
};

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
  if (items.length === 0) return [];

  const visited = new Set<number>();
  const clusters: TextRegion[] = [];

  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;

    const currentCluster: TextUnit[] = [items[i]];
    visited.add(i);

    let addedNew = true;
    while (addedNew) {
      addedNew = false;
      for (let j = 0; j < items.length; j++) {
        if (visited.has(j)) continue;

        const candidate = items[j];
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

    clusters.push({
      id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      bbox: combinedBbox,
      text: combinedText,
      confidence: Math.round(avgConfidence),
      category: classifyRegionCategory(combinedBbox, combinedText),
      isCleaned: false,
    });
  }

  return clusters;
}

/**
 * Primary OCR & Detection runner.
 */
export async function detectTextRegions(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  onProgress?: (progress: OcrProgress) => void
): Promise<TextRegion[]> {
  try {
    if (onProgress) onProgress({ status: 'Initializing OCR Engine...', progress: 0.1 });

    const worker = await createWorker('eng');

    if (onProgress) onProgress({ status: 'Analyzing image layout & text...', progress: 0.4 });

    // Use page segmentation mode SPARSE_TEXT (11) for detecting floating text / bubbles on comic pages
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    // In Tesseract.js v7, passing { blocks: true } as the 3rd argument populates layout data
    const ret = await worker.recognize(imageSource, {}, { blocks: true });

    if (onProgress) onProgress({ status: 'Processing text blocks...', progress: 0.8 });

    const rawUnits: TextUnit[] = [];

    // Extract word-level bounding boxes from Tesseract layout output
    const data = ret.data as {
      blocks?: Array<{
        paragraphs?: Array<{
          lines?: Array<{
            words?: Array<{
              bbox: { x0: number; y0: number; x1: number; y1: number };
              text: string;
              confidence: number;
            }>;
            bbox?: { x0: number; y0: number; x1: number; y1: number };
            text?: string;
            confidence?: number;
          }>;
        }>;
      }>;
    };

    if (data.blocks && data.blocks.length > 0) {
      for (const block of data.blocks) {
        if (!block.paragraphs) continue;
        for (const para of block.paragraphs) {
          if (!para.lines) continue;
          for (const line of para.lines) {
            if (line.words && line.words.length > 0) {
              for (const word of line.words) {
                const text = word.text ? word.text.trim() : '';
                if (!text) continue;
                const b = word.bbox;
                if (!b) continue;
                const width = b.x1 - b.x0;
                const height = b.y1 - b.y0;

                if (width < 3 || height < 3) continue;

                rawUnits.push({
                  bbox: { x: b.x0, y: b.y0, width, height },
                  text,
                  confidence: word.confidence ?? 80,
                });
              }
            } else if (line.text && line.bbox) {
              // Fallback to line box if word-level data is missing for a line
              const text = line.text.trim();
              if (text) {
                const b = line.bbox;
                const width = b.x1 - b.x0;
                const height = b.y1 - b.y0;
                if (width >= 3 && height >= 3) {
                  rawUnits.push({
                    bbox: { x: b.x0, y: b.y0, width, height },
                    text,
                    confidence: line.confidence ?? 80,
                  });
                }
              }
            }
          }
        }
      }
    }

    await worker.terminate();

    if (onProgress) onProgress({ status: 'Clustering text regions...', progress: 0.95 });

    const regions = clusterBoxes(rawUnits);

    if (onProgress) onProgress({ status: 'Done', progress: 1.0 });

    return regions;
  } catch (err) {
    console.warn('Tesseract OCR error or worker fallback:', err);
    return [];
  }
}

/**
 * Re-run OCR on a specific bounding box region of an image.
 */
export async function recognizeRegionText(
  imageSource: string | HTMLCanvasElement,
  bbox: BoundingBox
): Promise<string> {
  try {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(imageSource, {
      rectangle: {
        left: bbox.x,
        top: bbox.y,
        width: bbox.width,
        height: bbox.height,
      },
    });
    await worker.terminate();
    return ret.data.text.trim();
  } catch (err) {
    console.error('Failed to recognize region text:', err);
    return '';
  }
}
