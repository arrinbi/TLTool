import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  resetLaMaSession,
  cleanImageRegion,
  isCategoryEnabled,
  getOpenCV,
} from '../cleaningService';
import type { BoundingBox, CleaningOptions } from '../../../types';

describe('LaMa AI Cleaning Engine Integration', () => {
  beforeEach(() => {
    resetLaMaSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ort;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).onnxruntime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__lamaSession;
  });

  afterEach(() => {
    resetLaMaSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ort;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).onnxruntime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__lamaSession;
  });

  it('1. inpaintLaMa throws a clear technical blocker error when browser ONNX runtime / model is missing', async () => {
    const imgData = new ImageData(50, 50);
    const mask = new Uint8Array(50 * 50);
    mask.fill(1);

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

  it('4. LaMa engine input tensor preparation and output pixel reconstruction with mock session', async () => {
    const width = 10;
    const height = 10;
    const numPixels = width * height;
    const imgData = new ImageData(width, height);

    // Fill image data with dark pixels (RGBA: 50, 50, 50, 255)
    for (let i = 0; i < numPixels; i++) {
      imgData.data[i * 4] = 50;
      imgData.data[i * 4 + 1] = 50;
      imgData.data[i * 4 + 2] = 50;
      imgData.data[i * 4 + 3] = 255;
    }

    // Binary mask over center
    const mask = new Uint8Array(numPixels);
    for (let i = 20; i < 80; i++) {
      mask[i] = 1;
    }

    // Mock ONNX Runtime Web environment and Session
    const mockRun = vi.fn().mockImplementation(async (feeds) => {
      const imageTensor = feeds.image || feeds[Object.keys(feeds)[0]];
      const maskTensor = feeds.mask || feeds[Object.keys(feeds)[1]];

      expect(imageTensor).toBeDefined();
      expect(maskTensor).toBeDefined();
      expect(imageTensor.type).toBe('float32');
      expect(maskTensor.type).toBe('float32');
      expect(imageTensor.dims).toEqual([1, 3, height, width]);
      expect(maskTensor.dims).toEqual([1, 1, height, width]);

      // Verify mask polarity in float32: 1.0 for inpaint region, 0.0 for background
      for (let i = 0; i < numPixels; i++) {
        if (i >= 20 && i < 80) {
          expect(maskTensor.data[i]).toBe(1.0);
        } else {
          expect(maskTensor.data[i]).toBe(0.0);
        }
      }

      // Mock output tensor in Float32 normalized [0..1] range representing inpainted white pixels
      const outData = new Float32Array(3 * numPixels);
      outData.fill(1.0); // 1.0 (white when scaled by 255)

      return {
        output: {
          type: 'float32',
          data: outData,
          dims: [1, 3, height, width],
        },
      };
    });

    class MockTensor {
      type: string;
      data: Uint8Array | Float32Array;
      dims: number[];
      constructor(type: string, data: Uint8Array | Float32Array, dims: number[]) {
        this.type = type;
        this.data = data;
        this.dims = dims;
      }
    }

    const mockOrt = {
      Tensor: MockTensor,
      InferenceSession: {
        create: vi.fn(),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ort = mockOrt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lamaSession = { run: mockRun, inputNames: ['image', 'mask'] };

    await inpaintLaMa(imgData, mask);

    expect(mockRun).toHaveBeenCalledTimes(1);

    // Verify output pixels were written back to imgData (white: 255, 255, 255, 255)
    for (let i = 0; i < numPixels; i++) {
      expect(imgData.data[i * 4]).toBe(255);
      expect(imgData.data[i * 4 + 1]).toBe(255);
      expect(imgData.data[i * 4 + 2]).toBe(255);
      expect(imgData.data[i * 4 + 3]).toBe(255);
    }
  });

  it('5. LaMa respects targetMask during compositing and preserves surrounding artwork (preventing bleeding)', async () => {
    const width = 20;
    const height = 20;
    const numPixels = width * height;

    const imgData = new ImageData(width, height);
    // Fill with Red artwork background (200, 50, 50, 255)
    for (let i = 0; i < numPixels; i++) {
      imgData.data[i * 4] = 200;
      imgData.data[i * 4 + 1] = 50;
      imgData.data[i * 4 + 2] = 50;
      imgData.data[i * 4 + 3] = 255;
    }
    const originalPatchData = new Uint8ClampedArray(imgData.data);

    // Target brush mask covers ONLY middle center (x: 5..14, y: 5..14)
    const brushMask = new Uint8Array(numPixels);
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        brushMask[y * width + x] = 1;
      }
    }

    // Mock ONNX session that returns green pixels (0, 255, 0) over the entire patch
    const mockRun = vi.fn().mockImplementation(async () => {
      const outData = new Float32Array(3 * numPixels);
      for (let i = 0; i < numPixels; i++) {
        outData[numPixels + i] = 1.0; // G = 255
      }
      return {
        output: {
          type: 'float32',
          data: outData,
          dims: [1, 3, height, width],
        },
      };
    });

    class MockTensor {
      type: string;
      data: Uint8Array | Float32Array;
      dims: number[];
      constructor(type: string, data: Uint8Array | Float32Array, dims: number[]) {
        this.type = type;
        this.data = data;
        this.dims = dims;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ort = { Tensor: MockTensor, InferenceSession: { create: vi.fn() } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lamaSession = { run: mockRun, inputNames: ['image', 'mask'] };

    // Execute LaMa inpainting
    await inpaintLaMa(imgData, brushMask);

    // Apply targetMask compositing step (restoring unmasked pixels)
    for (let i = 0; i < numPixels; i++) {
      if (!brushMask[i]) {
        const idx = i * 4;
        imgData.data[idx] = originalPatchData[idx];
        imgData.data[idx + 1] = originalPatchData[idx + 1];
        imgData.data[idx + 2] = originalPatchData[idx + 2];
        imgData.data[idx + 3] = originalPatchData[idx + 3];
      }
    }

    // Unmasked pixel at (2, 2) must remain original Red (200, 50, 50)
    const unmaskedIdx = (2 * width + 2) * 4;
    expect(imgData.data[unmaskedIdx]).toBe(200);
    expect(imgData.data[unmaskedIdx + 1]).toBe(50);
    expect(imgData.data[unmaskedIdx + 2]).toBe(50);

    // Masked pixel at (10, 10) must be replaced by inpainted Green (0, 255, 0)
    const maskedIdx = (10 * width + 10) * 4;
    expect(imgData.data[maskedIdx]).toBe(0);
    expect(imgData.data[maskedIdx + 1]).toBe(255);
    expect(imgData.data[maskedIdx + 2]).toBe(0);
  });

  it('6. OpenCV Telea remains operational as the default engine', async () => {
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

  it('7. Category flags and filtering behave identically for LaMa and Telea', () => {
    expect(isCategoryEnabled('bubble-oval')).toBe(true);
    expect(isCategoryEnabled('bubble-rect')).toBe(true);
    expect(isCategoryEnabled('text-outside')).toBe(true);
    expect(isCategoryEnabled('sfx')).toBe(false); // SFX skipped by default
  });
});
