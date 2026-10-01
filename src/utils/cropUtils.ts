import type { TextRegion, CropRect } from '../types';

/**
 * Translates and clips text regions relative to a crop rectangle.
 * Regions outside the crop rectangle are removed.
 * Regions intersecting the crop boundary are clipped to the crop bounds,
 * and their brush points and pixel brush masks are properly translated/cropped.
 */
export function transformRegionsForCrop(
  regions: TextRegion[],
  cropRect: CropRect
): TextRegion[] {
  const transformed: TextRegion[] = [];

  for (const region of regions) {
    const oldX = region.bbox.x;
    const oldY = region.bbox.y;
    const oldW = region.bbox.width;
    const oldH = region.bbox.height;

    // Calculate intersection between region bbox and crop rectangle
    const interMinX = Math.max(oldX, cropRect.x);
    const interMinY = Math.max(oldY, cropRect.y);
    const interMaxX = Math.min(oldX + oldW, cropRect.x + cropRect.width);
    const interMaxY = Math.min(oldY + oldH, cropRect.y + cropRect.height);

    const interW = interMaxX - interMinX;
    const interH = interMaxY - interMinY;

    // Discard region if completely outside crop box or zero area
    if (interW <= 0 || interH <= 0) {
      continue;
    }

    const newX = interMinX - cropRect.x;
    const newY = interMinY - cropRect.y;

    let newBrushPoints = region.brushPoints;
    if (newBrushPoints && newBrushPoints.length > 0) {
      newBrushPoints = newBrushPoints.map((p) => ({
        x: p.x - cropRect.x,
        y: p.y - cropRect.y,
      }));
    }

    let newBrushMask = region.brushMask;
    if (region.brushMask && region.brushMask.length > 0) {
      const oldMask = region.brushMask;
      const offsetX = interMinX - oldX;
      const offsetY = interMinY - oldY;

      const maskBuffer = new Uint8Array(interW * interH);
      let hasPixels = false;

      for (let y = 0; y < interH; y++) {
        for (let x = 0; x < interW; x++) {
          const oldIndex = (offsetY + y) * oldW + (offsetX + x);
          if (oldIndex >= 0 && oldIndex < oldMask.length) {
            const val = oldMask[oldIndex];
            maskBuffer[y * interW + x] = val;
            if (val > 0) {
              hasPixels = true;
            }
          }
        }
      }

      if (!hasPixels && region.isBrush) {
        // All painted stroke pixels were outside the crop boundary
        continue;
      }

      newBrushMask = maskBuffer;
    }

    transformed.push({
      ...region,
      bbox: {
        x: newX,
        y: newY,
        width: interW,
        height: interH,
      },
      brushPoints: newBrushPoints,
      brushMask: newBrushMask,
    });
  }

  return transformed;
}

/**
 * Crops an image source string using image pixel coordinates and returns a PNG URL.
 */
export async function cropImageSource(
  imageSource: string,
  cropRect: CropRect
): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageSource;

  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth !== 0) {
      resolve();
    } else {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
    }
  });

  const cropX = Math.max(0, Math.round(cropRect.x));
  const cropY = Math.max(0, Math.round(cropRect.y));
  const cropW = Math.max(1, Math.round(cropRect.width));
  const cropH = Math.max(1, Math.round(cropRect.height));

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas 2d context for cropping image');
  }

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  if (canvas.toBlob) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(canvas.toDataURL('image/png'));
        }
      }, 'image/png');
    });
  }

  return canvas.toDataURL('image/png');
}
