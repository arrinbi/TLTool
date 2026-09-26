import { describe, it, expect, beforeEach } from 'vitest';
import {
  sampleBorderColor,
  generateTextMask,
  cleanBubbleText,
  inpaintTextMask,
  CLEANING_LIMITATIONS_NOTICE,
} from '../cleaningService';
import type { BoundingBox } from '../../../types';

describe('Cleaning Engine Unit & Realistic Artwork Tests', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    mockCtx = canvas.getContext('2d')!;

    // Fill background with white
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(0, 0, 100, 100);

    // Draw a small red box inside canvas
    mockCtx.fillStyle = '#ff0000';
    mockCtx.fillRect(20, 20, 30, 30);
  });

  it('samples border pixel colors correctly around bounding box', () => {
    const bbox: BoundingBox = { x: 25, y: 25, width: 10, height: 10 };
    const sampled = sampleBorderColor(mockCtx, bbox, 2);

    expect(sampled.r).toBeGreaterThan(200);
    expect(sampled.g).toBeLessThan(50);
    expect(sampled.b).toBeLessThan(50);
    expect(sampled.hex.toLowerCase()).toBe('#ff0000');
  });

  it('samples white background outside red box', () => {
    const bbox: BoundingBox = { x: 70, y: 70, width: 10, height: 10 };
    const sampled = sampleBorderColor(mockCtx, bbox, 2);

    expect(sampled.hex.toLowerCase()).toBe('#ffffff');
  });

  it('exports technical limitations notice with structured guidelines', () => {
    expect(CLEANING_LIMITATIONS_NOTICE.title).toBeDefined();
    expect(CLEANING_LIMITATIONS_NOTICE.items.length).toBeGreaterThan(0);
  });

  describe('Realistic Manhwa Artwork Preservation Scenarios', () => {
    it('Scenario 1: Speech bubble with border and tail', () => {
      // 60x60 canvas: white speech bubble background, dark border perimeter (representing bubble outline), plus a tail extending to edge
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;

      // Solid white background inside bubble
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 60, 60);

      // Black bubble border (outline touching/near edges)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 56, 56);

      // Black text stroke inside bubble ("HI")
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 10, 10); // "HI" text stroke candidate

      const imgData = ctx.getImageData(0, 0, 60, 60);
      const maskResult = generateTextMask(imgData);

      // Clean text stroke using bubble fill
      cleanBubbleText(imgData, maskResult.mask, { r: 255, g: 255, b: 255 });
      ctx.putImageData(imgData, 0, 0);

      // Check that the text stroke at (28, 28) was cleaned to white
      const textPixel = ctx.getImageData(28, 28, 1, 1).data;
      expect(textPixel[0]).toBe(255);
      expect(textPixel[1]).toBe(255);

      // Check that the speech bubble outline at (2, 30) is preserved as black
      const borderPixel = ctx.getImageData(2, 30, 1, 1).data;
      expect(borderPixel[0]).toBeLessThan(50);
    });

    it('Scenario 2: Black text over a textured background', () => {
      // 50x50 canvas with a gray background
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      // Background fill (RGB 180, 180, 180)
      ctx.fillStyle = '#b4b4b4';
      ctx.fillRect(0, 0, 50, 50);

      // Black text stroke in center
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, 10, 10);

      const imgData = ctx.getImageData(0, 0, 50, 50);
      const maskResult = generateTextMask(imgData);

      // Text stroke at center should be masked
      expect(maskResult.mask[25 * 50 + 25]).toBe(1);

      // Inpaint text mask using background texture
      inpaintTextMask(imgData, maskResult.mask);

      // Check pixel in imgData directly (inpaintTextMask mutates imgData)
      const centerIdx = (25 * 50 + 25) * 4;
      const r = imgData.data[centerIdx];
      expect(r).toBeGreaterThan(150);
      expect(r).toBeLessThan(210);
    });

    it('Scenario 3: Text crossing line art / Hair strands', () => {
      // 60x60 canvas with a long vertical hair strand / line art crossing the patch
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;

      // Light background (e.g., character skin/background RGB 220)
      ctx.fillStyle = '#dcdcdc';
      ctx.fillRect(0, 0, 60, 60);

      // Long vertical hair strand running top to bottom at x=10
      ctx.fillStyle = '#101010';
      ctx.fillRect(10, 0, 2, 60);

      // Compact text character at x=30, y=25 (size 8x8)
      ctx.fillRect(30, 25, 8, 8);

      const imgData = ctx.getImageData(0, 0, 60, 60);
      const maskResult = generateTextMask(imgData);

      // Text stroke at (32, 28) should be detected in mask
      expect(maskResult.mask[28 * 60 + 32]).toBe(1);

      // Hair strand at (10, 5) extending full length should NOT be classified as text stroke
      expect(maskResult.mask[5 * 60 + 10]).toBe(0);
    });

    it('Scenario 4: Text over clothing folds and shadows', () => {
      // 50x50 canvas with soft clothing shadow (shading gradient)
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      // Base clothing fill (RGB 200)
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(0, 0, 50, 50);

      // Soft shadow fold (RGB 160, low luminance contrast ~40 diff)
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(0, 30, 50, 20);

      // Dark text stroke over clothing (RGB 0)
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 10, 8, 8);

      const imgData = ctx.getImageData(0, 0, 50, 50);
      const maskResult = generateTextMask(imgData);

      // Text stroke at (22, 12) should be masked
      expect(maskResult.mask[12 * 50 + 22]).toBe(1);

      // Soft clothing shadow fold at (25, 40) should NOT be masked
      expect(maskResult.mask[40 * 50 + 25]).toBe(0);
    });

    it('Scenario 5: Text near facial line art (Eye / Nose / Outline)', () => {
      // 60x60 canvas representing character face with eye outline
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;

      // Skin tone background (RGB 245, 220, 200)
      ctx.fillStyle = '#f5dcc8';
      ctx.fillRect(0, 0, 60, 60);

      // Eye contour line art near top edge
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(5, 5, 50, 2); // long thin horizontal eye stroke

      // Dark text stroke in lower region
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 30, 10, 10);

      const imgData = ctx.getImageData(0, 0, 60, 60);
      const maskResult = generateTextMask(imgData);

      // Facial eye line art at (30, 5) should NOT be masked (extreme aspect ratio / touches edge)
      expect(maskResult.mask[5 * 60 + 30]).toBe(0);

      // Text stroke at (30, 35) should be masked
      expect(maskResult.mask[35 * 60 + 30]).toBe(1);
    });

    it('Scenario 6: Anti-aliased text edges handled smoothly', () => {
      // 40x40 canvas with crisp core text stroke and anti-aliased gray halo edge
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 40, 40);

      // Core black text stroke
      ctx.fillStyle = '#000000';
      ctx.fillRect(15, 15, 10, 10);

      // Anti-aliased gray halo around text stroke
      ctx.fillStyle = '#808080';
      ctx.fillRect(14, 14, 12, 1);
      ctx.fillRect(14, 25, 12, 1);

      const imgData = ctx.getImageData(0, 0, 40, 40);
      const maskResult = generateTextMask(imgData);

      // Mask dilation should extend to cover anti-aliasing edge at (14, 14)
      expect(maskResult.mask[14 * 40 + 14]).toBe(1);
    });

    it('Scenario 7: False positive prevention on standalone hair / line art without text', () => {
      // 50x50 canvas containing ONLY character hair lines and no text
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(0, 0, 50, 50);

      // Fine hair strands extending across patch
      ctx.fillStyle = '#202020';
      ctx.fillRect(5, 0, 1, 50); // Vertical hair strand
      ctx.fillRect(25, 0, 1, 50); // Second vertical hair strand

      const imgData = ctx.getImageData(0, 0, 50, 50);
      const maskResult = generateTextMask(imgData);

      // Hair strands spanning full height should produce 0 text mask pixels
      expect(maskResult.maskPixelCount).toBe(0);
    });
  });
});
