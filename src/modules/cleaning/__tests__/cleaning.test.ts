import { describe, it, expect, beforeEach } from 'vitest';
import {
  sampleBorderColor,
  generateTextMask,
  cleanBubbleText,
  inpaintTextMask,
  CLEANING_LIMITATIONS_NOTICE,
} from '../cleaningService';
import type { BoundingBox } from '../../../types';

describe('Cleaning Engine Unit Tests', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    // Create an in-memory HTML canvas for testing pixel sampling
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    mockCtx = canvas.getContext('2d')!;

    // Fill canvas background with white
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(0, 0, 100, 100);

    // Draw a small red box inside canvas
    mockCtx.fillStyle = '#ff0000';
    mockCtx.fillRect(20, 20, 30, 30);
  });

  it('samples border pixel colors correctly around bounding box', () => {
    // Bounding box at 25, 25, size 10, 10 (inside red square)
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

  it('generates a pixel-level text mask isolating high-contrast text strokes', () => {
    // Create 40x40 patch with white background and black text square in center (15..25)
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 40, 40);

    // Black text stroke
    ctx.fillStyle = '#000000';
    ctx.fillRect(15, 15, 10, 10);

    const imgData = ctx.getImageData(0, 0, 40, 40);
    const result = generateTextMask(imgData, { dilationRadius: 1 });

    expect(result.isUniformBackground).toBe(true);
    expect(result.maskPixelCount).toBeGreaterThan(0);

    // Center pixel (20, 20) must be masked as text
    expect(result.mask[20 * 40 + 20]).toBe(1);

    // Far corner pixel (1, 1) must be preserved as non-text background
    expect(result.mask[1 * 40 + 1]).toBe(0);
  });

  it('cleans bubble text by erasing only text stroke mask pixels without wiping whole patch', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;

    // Blue bubble background with black text in center
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 40, 40);

    // Black text
    ctx.fillStyle = '#000000';
    ctx.fillRect(18, 18, 4, 4);

    const imgData = ctx.getImageData(0, 0, 40, 40);
    const textMask = generateTextMask(imgData, { dilationRadius: 0 });

    // Clean text pixels with white fill
    cleanBubbleText(imgData, textMask.mask, { r: 255, g: 255, b: 255 });

    // Non-text background pixel at (5, 5) MUST remain original blue (0, 0, 255)
    const bgIdx = (5 * 40 + 5) * 4;
    expect(imgData.data[bgIdx]).toBe(0);
    expect(imgData.data[bgIdx + 1]).toBe(0);
    expect(imgData.data[bgIdx + 2]).toBe(255);

    // Text pixel at (19, 19) MUST be filled with white (255, 255, 255)
    const textIdx = (19 * 40 + 19) * 4;
    expect(imgData.data[textIdx]).toBe(255);
    expect(imgData.data[textIdx + 1]).toBe(255);
    expect(imgData.data[textIdx + 2]).toBe(255);
  });

  it('inpaints wild text over artwork preserving surrounding non-text artwork pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;

    // Artwork: Green background
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 40, 40);

    // Text stroke over artwork: Black box in center
    ctx.fillStyle = '#000000';
    ctx.fillRect(18, 18, 4, 4);

    const imgData = ctx.getImageData(0, 0, 40, 40);

    // Create mask for text center
    const mask = new Uint8Array(40 * 40);
    for (let y = 18; y < 22; y++) {
      for (let x = 18; x < 22; x++) {
        mask[y * 40 + x] = 1;
      }
    }

    inpaintTextMask(imgData, mask, 3, 2);

    // Surrounding green artwork pixel at (5, 5) MUST remain untouched green (0, 255, 0)
    const bgIdx = (5 * 40 + 5) * 4;
    expect(imgData.data[bgIdx]).toBe(0);
    expect(imgData.data[bgIdx + 1]).toBe(255);
    expect(imgData.data[bgIdx + 2]).toBe(0);

    // Inpainted text pixel at (19, 19) should now be green (inpainted from surrounding artwork)
    const inpaintedIdx = (19 * 40 + 19) * 4;
    expect(imgData.data[inpaintedIdx + 1]).toBeGreaterThan(200); // Green channel filled
  });

  it('exports technical limitations notice with structured guidelines', () => {
    expect(CLEANING_LIMITATIONS_NOTICE.title).toBeDefined();
    expect(CLEANING_LIMITATIONS_NOTICE.items.length).toBeGreaterThan(0);
  });
});
