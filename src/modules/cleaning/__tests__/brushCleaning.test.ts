import { describe, it, expect, vi } from 'vitest';
import { createBrushMask } from '../../../utils/brushUtils';

// Mock OpenCV module before importing cleaningService
vi.mock('@techstark/opencv-js', () => {
  const inpaintFn = vi.fn();
  return {
    default: {
      inpaint: inpaintFn,
      COLOR_RGBA2RGB: 1,
      COLOR_RGB2RGBA: 2,
      CV_8UC1: 0,
      INPAINT_TELEA: 1,
      matFromImageData: (imgData: ImageData) => ({
        delete: vi.fn(),
        data: new Uint8Array(imgData.data.length),
      }),
      Mat: class {
        data: Uint8Array = new Uint8Array(0);
        constructor(h?: number, w?: number) {
          if (h && w) {
            this.data = new Uint8Array(h * w * 4);
          }
        }
        delete() {}
      },
      cvtColor: (src: { data?: Uint8Array }, dst: { data?: Uint8Array }) => {
        if (src && src.data && dst) {
          dst.data = new Uint8Array(src.data.length);
        }
      },
    },
  };
});

import { cleanImageRegion, getOpenCV } from '../cleaningService';
import type { BoundingBox, CleaningOptions } from '../../../types';

describe('Lightroom-Style Remove/Healing Brush Core Mechanics', () => {
  it('1. A brush stroke produces a non-rectangular mask', () => {
    // Horizontal stroke from (20, 20) to (40, 20) with brushSize = 10 (radius = 5)
    const points = [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
    ];
    const brushSize = 10;
    const { bbox, mask } = createBrushMask(points, brushSize, 100, 100);

    expect(bbox.width).toBeGreaterThan(0);
    expect(bbox.height).toBeGreaterThan(0);

    // Verify mask length equals bounding box area
    expect(mask.length).toBe(bbox.width * bbox.height);

    // Bounding box area has both 1s (painted stroke) and 0s (unpainted corners)
    let paintedCount = 0;
    let unpaintedCount = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) paintedCount++;
      else if (mask[i] === 0) unpaintedCount++;
    }

    expect(paintedCount).toBeGreaterThan(0);
    expect(unpaintedCount).toBeGreaterThan(0);
    expect(paintedCount).toBeLessThan(mask.length); // Proves non-rectangular shape
  });

  it('2. Brush size affects the mask correctly', () => {
    const points = [
      { x: 50, y: 50 },
      { x: 70, y: 50 },
    ];

    // Small brush (size 10, radius 5)
    const smallResult = createBrushMask(points, 10, 200, 200);
    let smallCount = 0;
    for (let i = 0; i < smallResult.mask.length; i++) {
      if (smallResult.mask[i] === 1) smallCount++;
    }

    // Large brush (size 30, radius 15)
    const largeResult = createBrushMask(points, 30, 200, 200);
    let largeCount = 0;
    for (let i = 0; i < largeResult.mask.length; i++) {
      if (largeResult.mask[i] === 1) largeCount++;
    }

    // Larger brush size must produce significantly more covered mask pixels
    expect(largeCount).toBeGreaterThan(smallResult.mask.length > 0 ? smallCount * 2 : 0);
    expect(largeResult.bbox.width).toBeGreaterThan(smallResult.bbox.width);
    expect(largeResult.bbox.height).toBeGreaterThan(smallResult.bbox.height);
  });

  it('3. Pixels outside the painted area are not included in the cleaning mask', () => {
    // Single point stroke at (50, 50) with brushSize = 10 (radius = 5)
    const points = [{ x: 50, y: 50 }];
    const { bbox, mask } = createBrushMask(points, 10, 100, 100);

    // Corner pixel of bounding box
    const cornerIdx = 0;
    expect(mask[cornerIdx]).toBe(0); // Pixel outside painted radius must be 0

    // Center pixel at (50, 50) relative to bbox
    const relCenterX = Math.floor(50 - bbox.x);
    const relCenterY = Math.floor(50 - bbox.y);
    const centerIdx = relCenterY * bbox.width + relCenterX;

    expect(mask[centerIdx]).toBe(1); // Center pixel must be 1
  });

  it('5. OpenCV Telea receives the brush mask rather than its bounding box', async () => {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);

    // Create a 20x20 bounding box with a non-rectangular brush mask
    const bbox: BoundingBox = { x: 40, y: 40, width: 20, height: 20 };
    const brushMask = new Uint8Array(20 * 20);
    let maskPixelCount = 0;

    // Fill only a 10x10 circle in center with 1
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        brushMask[y * 20 + x] = 1;
        maskPixelCount++;
      }
    }

    const cv = await getOpenCV();

    const canvasUrl = canvas.toDataURL('image/png');
    const options: CleaningOptions = {
      method: 'opencv-telea',
      padding: 0,
      isBrush: true,
      brushMask,
    };

    await cleanImageRegion(canvasUrl, bbox, options);

    expect(cv.inpaint).toHaveBeenCalled();
    const maskMat = (cv.inpaint as ReturnType<typeof vi.fn>).mock.calls[0][1];

    expect(maskMat).toBeDefined();
    let passed255Count = 0;
    if (maskMat && maskMat.data) {
      for (let i = 0; i < maskMat.data.length; i++) {
        if (maskMat.data[i] === 255) passed255Count++;
      }
    }

    expect(passed255Count).toBe(maskPixelCount);
    expect(passed255Count).toBeLessThan(bbox.width * bbox.height); // Proves brush mask received, NOT bounding box filled with 1s
  });
});
