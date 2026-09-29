import type { BoundingBox } from '../types';

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
