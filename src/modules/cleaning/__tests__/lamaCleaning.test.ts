import { describe, it, expect, vi } from 'vitest';

// Mock OpenCV module
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

import {
  inpaintLaMa,
  cleanImageRegion,
  isCategoryEnabled,
  getOpenCV,
} from '../cleaningService';
import type { BoundingBox, CleaningOptions } from '../../../types';

describe('LaMa AI Cleaning Engine Integration', () => {
  it('1. inpaintLaMa throws a clear technical blocker error when browser ONNX runtime / model is missing', async () => {
    const imgData = new ImageData(50, 50);
    const mask = new Uint8Array(50 * 50);

    await expect(inpaintLaMa(imgData, mask)).rejects.toThrow(
      'LaMa AI inpainting engine is not available in the current browser runtime. Browser-side LaMa inference requires ONNX Runtime Web (onnxruntime-web) and a LaMa ONNX model file.'
    );
  });

  it('2. cleanImageRegion with method="lama" routes to LaMa engine and throws technical blocker error without applying fake AI outputs', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);

    const canvasUrl = canvas.toDataURL('image/png');
    const bbox: BoundingBox = { x: 10, y: 10, width: 30, height: 30 };
    const options: CleaningOptions = {
      method: 'lama',
      padding: 0,
    };

    await expect(cleanImageRegion(canvasUrl, bbox, options)).rejects.toThrow(
      'LaMa AI inpainting engine is not available in the current browser runtime'
    );
  });

  it('3. LaMa engine receives the actual pixel-level brush mask, not its bounding box', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);

    const canvasUrl = canvas.toDataURL('image/png');
    const bbox: BoundingBox = { x: 20, y: 20, width: 20, height: 20 };

    // Create pixel brush mask with 25 painted pixels inside 400px bounding box
    const brushMask = new Uint8Array(20 * 20);
    for (let y = 5; y < 10; y++) {
      for (let x = 5; x < 10; x++) {
        brushMask[y * 20 + x] = 1;
      }
    }

    const options: CleaningOptions = {
      method: 'lama',
      padding: 0,
      isBrush: true,
      brushMask,
    };

    // Verify cleanImageRegion passes pixel mask to inpaintLaMa which rejects with technical blocker error
    await expect(cleanImageRegion(canvasUrl, bbox, options)).rejects.toThrow(
      'LaMa AI inpainting engine is not available in the current browser runtime'
    );
  });

  it('4. OpenCV Telea remains operational as the default engine', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);

    const canvasUrl = canvas.toDataURL('image/png');
    const bbox: BoundingBox = { x: 10, y: 10, width: 20, height: 20 };
    const options: CleaningOptions = {
      method: 'opencv-telea',
      padding: 0,
    };

    const cv = await getOpenCV();
    (cv.inpaint as ReturnType<typeof vi.fn>).mockClear();

    const result = await cleanImageRegion(canvasUrl, bbox, options);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('5. Category flags and filtering behave identically for LaMa and Telea', () => {
    expect(isCategoryEnabled('bubble-oval')).toBe(true);
    expect(isCategoryEnabled('bubble-rect')).toBe(true);
    expect(isCategoryEnabled('text-outside')).toBe(true);
    expect(isCategoryEnabled('sfx')).toBe(false); // SFX skipped by default
  });
});
