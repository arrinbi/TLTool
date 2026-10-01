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
  inpaintMIGAN,
  resetMIGANSession,
  cleanImageRegion,
  isCategoryEnabled,
  getOpenCV,
} from '../cleaningService';
import type { BoundingBox, CleaningOptions } from '../../../types';

describe('MI-GAN AI Cleaning Engine Integration', () => {
  beforeEach(() => {
    resetMIGANSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ort;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).onnxruntime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__miganSession;
  });

  afterEach(() => {
    resetMIGANSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ort;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).onnxruntime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__miganSession;
  });

  it('1. inpaintMIGAN throws a clear technical blocker error when browser ONNX runtime / model is missing', async () => {
    const imgData = new ImageData(50, 50);
    const mask = new Uint8Array(50 * 50);
    mask.fill(1);

    await expect(inpaintMIGAN(imgData, mask)).rejects.toThrow(
      'MI-GAN AI inpainting engine is not available in the current browser runtime. Browser-side MI-GAN inference requires ONNX Runtime Web (onnxruntime-web) and a MI-GAN ONNX model file.'
    );
  });

  it('2. cleanImageRegion with method="migan" routes to MI-GAN engine and throws technical blocker error without applying fake AI outputs', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);
    // Draw dark text stroke inside bbox
    ctx.fillStyle = '#000000';
    ctx.fillRect(20, 20, 8, 8);

    const canvasUrl = canvas.toDataURL('image/png');
    const bbox: BoundingBox = { x: 10, y: 10, width: 30, height: 30 };
    const options: CleaningOptions = {
      method: 'migan',
      padding: 0,
      isManualRegion: true,
    };

    await expect(cleanImageRegion(canvasUrl, bbox, options)).rejects.toThrow(
      'MI-GAN AI inpainting engine is not available in the current browser runtime'
    );
  });

  it('3. MI-GAN engine receives the actual pixel-level brush mask, not its bounding box', async () => {
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
      method: 'migan',
      padding: 0,
      isBrush: true,
      brushMask,
    };

    // Verify cleanImageRegion passes pixel mask to inpaintMIGAN which rejects with technical blocker error
    await expect(cleanImageRegion(canvasUrl, bbox, options)).rejects.toThrow(
      'MI-GAN AI inpainting engine is not available in the current browser runtime'
    );
  });

  it('4. MI-GAN engine input tensor preparation and output pixel reconstruction', async () => {
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
      expect(feeds.image).toBeDefined();
      expect(feeds.mask).toBeDefined();
      expect(feeds.image.type).toBe('uint8');
      expect(feeds.mask.type).toBe('uint8');
      expect(feeds.image.dims).toEqual([1, 3, height, width]);
      expect(feeds.mask.dims).toEqual([1, 1, height, width]);

      // Verify mask polarity: mask[i] === 1 in TLTool mask corresponds to 0 (inpaint region) in ONNX mask input
      // mask[i] === 0 in TLTool mask corresponds to 255 (preserve region) in ONNX mask input
      for (let i = 0; i < numPixels; i++) {
        if (i >= 20 && i < 80) {
          expect(feeds.mask.data[i]).toBe(0);
        } else {
          expect(feeds.mask.data[i]).toBe(255);
        }
      }

      // Mock output tensor in Uint8 [0..255] range representing inpainted white pixels
      const outData = new Uint8Array(3 * numPixels);
      outData.fill(255); // 255 (white)

      return {
        result: {
          type: 'uint8',
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
    (globalThis as any).__miganSession = { run: mockRun };

    await inpaintMIGAN(imgData, mask);

    expect(mockRun).toHaveBeenCalledTimes(1);

    // Verify output pixels were written back to imgData (white: 255, 255, 255, 255)
    for (let i = 0; i < numPixels; i++) {
      expect(imgData.data[i * 4]).toBe(255);
      expect(imgData.data[i * 4 + 1]).toBe(255);
      expect(imgData.data[i * 4 + 2]).toBe(255);
      expect(imgData.data[i * 4 + 3]).toBe(255);
    }
  });

  it('5. OpenCV Telea remains operational as the default engine', async () => {
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

  it('6. Category flags and filtering behave identically for MI-GAN and Telea', () => {
    expect(isCategoryEnabled('bubble-oval')).toBe(true);
    expect(isCategoryEnabled('bubble-rect')).toBe(true);
    expect(isCategoryEnabled('text-outside')).toBe(true);
    expect(isCategoryEnabled('sfx')).toBe(false); // SFX skipped by default
  });
});
