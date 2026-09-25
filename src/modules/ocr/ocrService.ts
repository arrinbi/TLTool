import { createWorker } from 'tesseract.js';
import type { TextRegion, BoundingBox } from '../../types';

export interface OcrProgress {
  status: string;
  progress: number;
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

/**
 * Cluster line/word boxes into paragraph / bubble regions based on proximity.
 */
export function clusterBoxes(
  items: { bbox: BoundingBox; text: string; confidence: number }[],
  margin: number = 25
): TextRegion[] {
  if (items.length === 0) return [];

  const visited = new Set<number>();
  const clusters: TextRegion[] = [];

  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;

    const currentCluster: typeof items = [items[i]];
    visited.add(i);

    let addedNew = true;
    while (addedNew) {
      addedNew = false;
      for (let j = 0; j < items.length; j++) {
        if (visited.has(j)) continue;

        const isNear = currentCluster.some((cItem) => areBoxesNear(cItem.bbox, items[j].bbox, margin));
        if (isNear) {
          currentCluster.push(items[j]);
          visited.add(j);
          addedNew = true;
        }
      }
    }

    currentCluster.sort((a, b) => {
      const yDiff = a.bbox.y - b.bbox.y;
      if (Math.abs(yDiff) > 15) return yDiff;
      return a.bbox.x - b.bbox.x;
    });

    const combinedBbox = mergeBoxes(currentCluster.map((item) => item.bbox));
    const combinedText = currentCluster.map((item) => item.text.trim()).filter(Boolean).join('\n');
    const avgConfidence =
      currentCluster.reduce((sum, item) => sum + item.confidence, 0) / currentCluster.length;

    clusters.push({
      id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      bbox: combinedBbox,
      text: combinedText,
      confidence: Math.round(avgConfidence),
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

    // In Tesseract.js v7, passing { blocks: true } as the 3rd argument is required to populate block/layout data
    const ret = await worker.recognize(imageSource, {}, { blocks: true });

    if (onProgress) onProgress({ status: 'Processing text blocks...', progress: 0.8 });

    const rawItems: { bbox: BoundingBox; text: string; confidence: number }[] = [];

    // Extract blocks/lines from Tesseract data
    const data = ret.data as {
      blocks?: Array<{
        paragraphs?: Array<{
          lines?: Array<{
            bbox: { x0: number; y0: number; x1: number; y1: number };
            text: string;
            confidence: number;
          }>;
        }>;
        lines?: Array<{
          bbox: { x0: number; y0: number; x1: number; y1: number };
          text: string;
          confidence: number;
        }>;
      }>;
      lines?: Array<{
        bbox: { x0: number; y0: number; x1: number; y1: number };
        text: string;
        confidence: number;
      }>;
    };

    const addLine = (line: {
      bbox: { x0: number; y0: number; x1: number; y1: number };
      text: string;
      confidence: number;
    }) => {
      if (!line || !line.text || line.text.trim().length === 0) return;
      const b = line.bbox;
      if (!b) return;
      const width = b.x1 - b.x0;
      const height = b.y1 - b.y0;

      if (width < 5 || height < 5) return;

      rawItems.push({
        bbox: { x: b.x0, y: b.y0, width, height },
        text: line.text,
        confidence: line.confidence ?? 80,
      });
    };

    if (data.blocks && data.blocks.length > 0) {
      for (const block of data.blocks) {
        if (block.paragraphs) {
          for (const para of block.paragraphs) {
            if (para.lines) {
              for (const line of para.lines) {
                addLine(line);
              }
            }
          }
        }
        if (block.lines) {
          for (const line of block.lines) {
            addLine(line);
          }
        }
      }
    } else if (data.lines) {
      for (const line of data.lines) {
        addLine(line);
      }
    }

    await worker.terminate();

    if (onProgress) onProgress({ status: 'Clustering text regions...', progress: 0.95 });

    const regions = clusterBoxes(rawItems, 30);

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
