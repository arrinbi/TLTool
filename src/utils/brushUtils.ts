import type { BoundingBox, TextRegion } from '../types';

export interface BrushMaskResult {
  bbox: BoundingBox;
  mask: Uint8Array;
}

/**
 * Calculates squared distance from a point (px, py) to a line segment (ax, ay)-(bx, by).
 */

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  let t = ((px - ax) * vx + (py - ay) * vy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/**
 * Creates a true pixel-level binary mask from continuous or discrete brush stroke points.
 * Diameter of the brush is controlled by brushSize (radius = brushSize / 2).
 */
export function createBrushMask(
  points: Array<{ x: number; y: number }>,
  brushSize: number,
  imageWidth: number,
  imageHeight: number
): BrushMaskResult {
  if (points.length === 0) {
    return {
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      mask: new Uint8Array(1),
    };
  }

  const radius = Math.max(0.5, brushSize / 2);
  const radiusSq = radius * radius;
  const pad = Math.ceil(radius);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const bboxX = Math.max(0, Math.floor(minX - pad));
  const bboxY = Math.max(0, Math.floor(minY - pad));
  const bboxMaxX = Math.min(imageWidth, Math.ceil(maxX + pad));
  const bboxMaxY = Math.min(imageHeight, Math.ceil(maxY + pad));

  const width = Math.max(1, bboxMaxX - bboxX);
  const height = Math.max(1, bboxMaxY - bboxY);

  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const py = bboxY + y + 0.5;
    for (let x = 0; x < width; x++) {
      const px = bboxX + x + 0.5;
      let minDistanceSq = Infinity;

      if (points.length === 1) {
        const dx = px - points[0].x;
        const dy = py - points[0].y;
        minDistanceSq = dx * dx + dy * dy;
      } else {
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          // Bounding box pre-check for segment optimization
          const segMinX = Math.min(p1.x, p2.x) - radius;
          const segMaxX = Math.max(p1.x, p2.x) + radius;
          const segMinY = Math.min(p1.y, p2.y) - radius;
          const segMaxY = Math.max(p1.y, p2.y) + radius;

          if (px < segMinX || px > segMaxX || py < segMinY || py > segMaxY) {
            continue;
          }

          const dSq = distToSegmentSq(px, py, p1.x, p1.y, p2.x, p2.y);
          if (dSq < minDistanceSq) {
            minDistanceSq = dSq;
          }
        }
      }

      if (minDistanceSq <= radiusSq) {
        mask[y * width + x] = 1;
      }
    }
  }

  return {
    bbox: { x: bboxX, y: bboxY, width, height },
    mask,
  };
}

/**
 * Subtracts eraser stroke points from a region's cleaning mask.
 * If region.brushMask does not exist (e.g. rectangle region), a full mask (all 1s) of size bbox.width * bbox.height is initialized.
 * Eraser pixels are set to 0 in the resulting brushMask.
 */
export function subtractEraserFromRegion(
  region: TextRegion,
  eraserPoints: Array<{ x: number; y: number }>,
  eraserSize: number,
  imageWidth: number,
  imageHeight: number
): TextRegion {
  if (eraserPoints.length === 0) return region;

  const eraserMaskResult = createBrushMask(eraserPoints, eraserSize, imageWidth, imageHeight);
  const eBbox = eraserMaskResult.bbox;
  const rBbox = region.bbox;

  // Bounding box intersection check
  const intersects =
    eBbox.x < rBbox.x + rBbox.width &&
    eBbox.x + eBbox.width > rBbox.x &&
    eBbox.y < rBbox.y + rBbox.height &&
    eBbox.y + eBbox.height > rBbox.y;

  if (!intersects) return region;

  const rWidth = rBbox.width;
  const rHeight = rBbox.height;

  let currentMask: Uint8Array;
  if (region.brushMask && region.brushMask.length === rWidth * rHeight) {
    currentMask = new Uint8Array(region.brushMask);
  } else {
    currentMask = new Uint8Array(rWidth * rHeight);
    currentMask.fill(1);
  }

  let modified = false;
  for (let ey = 0; ey < eBbox.height; ey++) {
    const imgY = eBbox.y + ey;
    if (imgY < rBbox.y || imgY >= rBbox.y + rBbox.height) continue;
    const ry = imgY - rBbox.y;

    for (let ex = 0; ex < eBbox.width; ex++) {
      if (!eraserMaskResult.mask[ey * eBbox.width + ex]) continue;
      const imgX = eBbox.x + ex;
      if (imgX < rBbox.x || imgX >= rBbox.x + rBbox.width) continue;
      const rx = imgX - rBbox.x;

      const idx = ry * rWidth + rx;
      if (currentMask[idx] !== 0) {
        currentMask[idx] = 0;
        modified = true;
      }
    }
  }

  if (!modified) return region;

  return {
    ...region,
    brushMask: currentMask,
    isBrush: true,
  };
}

/**
 * Merges a new brush stroke into an existing region's mask, expanding region.bbox if necessary.
 */
export function mergeBrushStrokeToRegion(
  region: TextRegion,
  brushPoints: Array<{ x: number; y: number }>,
  brushSize: number,
  imageWidth: number,
  imageHeight: number
): TextRegion {
  if (brushPoints.length === 0) return region;

  const strokeResult = createBrushMask(brushPoints, brushSize, imageWidth, imageHeight);
  const sBbox = strokeResult.bbox;
  const rBbox = region.bbox;

  // Compute union bounding box
  const minX = Math.min(rBbox.x, sBbox.x);
  const minY = Math.min(rBbox.y, sBbox.y);
  const maxX = Math.max(rBbox.x + rBbox.width, sBbox.x + sBbox.width);
  const maxY = Math.max(rBbox.y + rBbox.height, sBbox.y + sBbox.height);

  const unionW = Math.max(1, maxX - minX);
  const unionH = Math.max(1, maxY - minY);

  const unionMask = new Uint8Array(unionW * unionH);

  // 1. Copy existing region mask into unionMask
  const rOffsetX = rBbox.x - minX;
  const rOffsetY = rBbox.y - minY;
  if (region.brushMask && region.brushMask.length === rBbox.width * rBbox.height) {
    for (let ry = 0; ry < rBbox.height; ry++) {
      for (let rx = 0; rx < rBbox.width; rx++) {
        if (region.brushMask[ry * rBbox.width + rx]) {
          unionMask[(rOffsetY + ry) * unionW + (rOffsetX + rx)] = 1;
        }
      }
    }
  } else {
    // Plain rectangle
    for (let ry = 0; ry < rBbox.height; ry++) {
      for (let rx = 0; rx < rBbox.width; rx++) {
        unionMask[(rOffsetY + ry) * unionW + (rOffsetX + rx)] = 1;
      }
    }
  }

  // 2. Copy new stroke mask into unionMask
  const sOffsetX = sBbox.x - minX;
  const sOffsetY = sBbox.y - minY;
  for (let sy = 0; sy < sBbox.height; sy++) {
    for (let sx = 0; sx < sBbox.width; sx++) {
      if (strokeResult.mask[sy * sBbox.width + sx]) {
        unionMask[(sOffsetY + sy) * unionW + (sOffsetX + sx)] = 1;
      }
    }
  }

  // Merge brush points if available
  const combinedPoints = [
    ...(region.brushPoints || []),
    ...brushPoints,
  ];

  return {
    ...region,
    bbox: { x: minX, y: minY, width: unionW, height: unionH },
    brushMask: unionMask,
    isBrush: true,
    brushPoints: combinedPoints,
    brushSize: Math.max(region.brushSize || brushSize, brushSize),
  };
}
