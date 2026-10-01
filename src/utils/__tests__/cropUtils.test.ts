import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transformRegionsForCrop, cropImageSource } from '../cropUtils';
import type { TextRegion, CropRect } from '../../types';

describe('cropUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transformRegionsForCrop', () => {
    const cropRect: CropRect = { x: 100, y: 200, width: 400, height: 800 };

    it('1. translates bounding box for regions completely inside crop box', () => {
      const regions: TextRegion[] = [
        {
          id: 'region-1',
          bbox: { x: 150, y: 250, width: 100, height: 50 },
          text: 'Inside Text',
          confidence: 95,
          isCleaned: false,
          category: 'bubble-oval',
        },
      ];

      const result = transformRegionsForCrop(regions, cropRect);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('region-1');
      expect(result[0].bbox).toEqual({ x: 50, y: 50, width: 100, height: 50 });
      expect(result[0].text).toBe('Inside Text');
      expect(result[0].confidence).toBe(95);
      expect(result[0].category).toBe('bubble-oval');
    });

    it('2. removes regions completely outside crop box', () => {
      const regions: TextRegion[] = [
        {
          id: 'region-outside-left',
          bbox: { x: 10, y: 250, width: 50, height: 50 },
          text: 'Outside Left',
          confidence: 90,
          isCleaned: false,
        },
        {
          id: 'region-outside-top',
          bbox: { x: 150, y: 10, width: 50, height: 50 },
          text: 'Outside Top',
          confidence: 90,
          isCleaned: false,
        },
      ];

      const result = transformRegionsForCrop(regions, cropRect);
      expect(result).toHaveLength(0);
    });

    it('3. intersects and translates partially overlapping regions', () => {
      const regions: TextRegion[] = [
        {
          id: 'region-overlap',
          bbox: { x: 80, y: 180, width: 100, height: 100 }, // Overlaps top-left: x 80..180 -> inter 100..180 (w=80), y 180..280 -> inter 200..280 (h=80)
          text: 'Overlapping Text',
          confidence: 88,
          isCleaned: true,
          cleaningMethod: 'opencv-telea',
        },
      ];

      const result = transformRegionsForCrop(regions, cropRect);

      expect(result).toHaveLength(1);
      expect(result[0].bbox).toEqual({ x: 0, y: 0, width: 80, height: 80 });
      expect(result[0].text).toBe('Overlapping Text');
      expect(result[0].isCleaned).toBe(true);
      expect(result[0].cleaningMethod).toBe('opencv-telea');
    });

    it('4. translates brushPoints and crops raster brushMask properly', () => {
      // Region bbox: x: 120, y: 220, w: 2, h: 2
      const oldMask = new Uint8Array([
        1, 1,
        0, 1,
      ]);

      const regions: TextRegion[] = [
        {
          id: 'brush-region-1',
          bbox: { x: 120, y: 220, width: 2, height: 2 },
          text: '',
          confidence: 100,
          isCleaned: false,
          isBrush: true,
          brushPoints: [
            { x: 120, y: 220 },
            { x: 121, y: 221 },
          ],
          brushMask: oldMask,
        },
      ];

      const result = transformRegionsForCrop(regions, cropRect);

      expect(result).toHaveLength(1);
      expect(result[0].bbox).toEqual({ x: 20, y: 20, width: 2, height: 2 });
      expect(result[0].brushPoints).toEqual([
        { x: 20, y: 20 },
        { x: 21, y: 21 },
      ]);
      expect(result[0].brushMask).toEqual(oldMask);
    });
  });

  describe('cropImageSource', () => {
    it('creates a canvas and crops image source', async () => {
      // Mock Image
      const origImage = window.Image;
      class MockImage {
        onload: () => void = () => {};
        onerror: (err: unknown) => void = () => {};
        src = '';
        complete = true;
        naturalWidth = 1000;
        naturalHeight = 1000;
        crossOrigin = '';
        constructor() {
          setTimeout(() => this.onload(), 0);
        }
      }
      window.Image = MockImage as unknown as typeof Image;

      const cropRect: CropRect = { x: 50, y: 50, width: 200, height: 300 };
      const url = await cropImageSource('data:image/png;base64,dummy', cropRect);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');

      window.Image = origImage;
    });
  });
});
