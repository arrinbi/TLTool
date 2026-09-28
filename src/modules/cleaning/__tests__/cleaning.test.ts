import { describe, it, expect, beforeEach } from 'vitest';
import {
  sampleBorderColor,
  generateTextMask,
  cleanBubbleText,
  inpaintTextMask,
  inpaintOpenCVTelea,
  isCategoryEnabled,
  cleanAllRegions,
  CLEANING_LIMITATIONS_NOTICE,
} from '../cleaningService';
import type { BoundingBox, TextRegion, CleaningOptions } from '../../../types';

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

  describe('Category Filtering & cleanAllRegions Runtime Behavior', () => {
    it('isCategoryEnabled correctly checks category flags for bubble-oval, bubble-rect, text-outside, and sfx', () => {
      // Default (no flags provided): SFX is false, others are true
      expect(isCategoryEnabled('bubble-oval')).toBe(true);
      expect(isCategoryEnabled('bubble-rect')).toBe(true);
      expect(isCategoryEnabled('text-outside')).toBe(true);
      expect(isCategoryEnabled('sfx')).toBe(false);

      // Explicit flags
      const flags = {
        cleanBubbleOval: true,
        cleanBubbleRect: false,
        cleanTextOutside: true,
        cleanSfx: false,
      };

      expect(isCategoryEnabled('bubble-oval', flags)).toBe(true);
      expect(isCategoryEnabled('bubble-rect', flags)).toBe(false);
      expect(isCategoryEnabled('text-outside', flags)).toBe(true);
      expect(isCategoryEnabled('sfx', flags)).toBe(false);
    });

    it('cleanAllRegions directly skips SFX region when cleanSfx === false and returns initial URL unchanged', async () => {
      const sfxRegion: TextRegion = {
        id: 'r1',
        bbox: { x: 10, y: 10, width: 20, height: 20 },
        text: 'BOOM!!',
        confidence: 90,
        isCleaned: false,
        category: 'sfx',
      };

      const options: CleaningOptions = {
        method: 'solid-white',
        padding: 2,
        categories: {
          cleanBubbleOval: true,
          cleanBubbleRect: true,
          cleanTextOutside: true,
          cleanSfx: false,
        },
      };

      const initialUrl = 'data:image/png;base64,initial_url_unchanged';
      const resultUrl = await cleanAllRegions(initialUrl, [sfxRegion], options);

      // Prove that cleanImageRegion was completely bypassed for SFX: the return value is the exact initial URL reference
      expect(resultUrl).toBe(initialUrl);
    });

    it('cleanAllRegions processes SFX region when cleanSfx === true and passes it through image cleaning', async () => {
      const sfxRegion: TextRegion = {
        id: 'r1',
        bbox: { x: 10, y: 10, width: 20, height: 20 },
        text: 'KABOOM!!',
        confidence: 98,
        isCleaned: false,
        category: 'sfx',
      };

      const options: CleaningOptions = {
        method: 'solid-white',
        padding: 2,
        categories: {
          cleanBubbleOval: true,
          cleanBubbleRect: true,
          cleanTextOutside: true,
          cleanSfx: true,
        },
      };

      const initialUrl = 'data:image/png;base64,initial_url_to_be_cleaned';
      const resultUrl = await cleanAllRegions(initialUrl, [sfxRegion], options);

      // Prove that cleanImageRegion was executed for SFX: result is a newly generated cleaned image data/blob URL
      expect(resultUrl).not.toBe(initialUrl);
      expect(typeof resultUrl).toBe('string');
      expect(resultUrl.length).toBeGreaterThan(0);
    });
  });

  describe('OpenCV Telea Cleaning Engine Path', () => {
    it('inpaintOpenCVTelea removes dark text in white speech bubble cleanly while preserving outer border', async () => {
      // 80x40 canvas with white speech bubble, black outline, and dark text
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;

      // 1. White speech bubble background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 80, 40);

      // 2. Black speech bubble border along left edge
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 3, 40);

      // 3. Dark text with anti-aliasing in middle
      ctx.fillStyle = '#808080';
      ctx.fillRect(15, 10, 50, 20); // Anti-aliasing fringe
      ctx.fillStyle = '#101010';
      ctx.fillRect(17, 12, 46, 16); // Core dark text

      const imgData = ctx.getImageData(0, 0, 80, 40);
      const textMaskResult = generateTextMask(imgData);

      // Verify text mask detected dark text in center
      expect(textMaskResult.maskPixelCount).toBeGreaterThan(0);

      // Execute OpenCV Telea Inpainting
      await inpaintOpenCVTelea(imgData, textMaskResult.mask);
      ctx.putImageData(imgData, 0, 0);

      // Verify text center at (40, 20) was inpainted cleanly to white (RGB >= 250)
      const centerPixel = ctx.getImageData(40, 20, 1, 1).data;
      expect(centerPixel[0]).toBeGreaterThanOrEqual(250);
      expect(centerPixel[1]).toBeGreaterThanOrEqual(250);
      expect(centerPixel[2]).toBeGreaterThanOrEqual(250);

      // Verify speech bubble border at (1, 20) is preserved as black
      const borderPixel = ctx.getImageData(1, 20, 1, 1).data;
      expect(borderPixel[0]).toBeLessThan(30);
      expect(borderPixel[1]).toBeLessThan(30);
      expect(borderPixel[2]).toBeLessThan(30);
    });
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

    it('includes subtle anti-aliased text pixels (color distance 15-25) and 2-pixel dilation halo in uniform text mask', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      // 1. Pure white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 50, 50);

      // 2. Dark text core at (20, 20) size 10x10
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, 10, 10);

      // 3. Very light gray anti-aliased pixel at (18, 18): RGB (242, 242, 242)
      // Color distance from white (255,255,255) = sqrt(13^2 * 3) ≈ 22.51
      // Old threshold (25) excluded this pixel from candidateMask; new threshold (15) includes it.
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(18, 18, 1, 1);

      const imgData = ctx.getImageData(0, 0, 50, 50);
      const maskResult = generateTextMask(imgData, true);

      // Subtle anti-aliased pixel at (18, 18) is included in mask
      expect(maskResult.mask[18 * 50 + 18]).toBe(1);

      // 2-pixel dilation covers pixel at distance 2: (18, 20)
      expect(maskResult.mask[20 * 50 + 18]).toBe(1);
    });

    it('Scenario 1b: Manually selected text region inside simple white speech bubble with dark text and anti-aliasing', () => {
      // 80x40 canvas simulating a manually selected region around text inside a simple white speech bubble
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;

      // 1. Solid white speech bubble background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 80, 40);

      // 2. Dark text with anti-aliased gray edges in center
      // Gray anti-aliased fringe
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(10, 8, 60, 24);
      // Core dark text
      ctx.fillStyle = '#101010';
      ctx.fillRect(12, 10, 56, 20);

      const imgData = ctx.getImageData(0, 0, 80, 40);
      const maskResult = generateTextMask(imgData);

      // Verify that background is detected as uniform speech bubble
      expect(maskResult.isUniformBackground).toBe(true);

      // Verify core text and anti-aliased fringe are masked
      expect(maskResult.mask[20 * 80 + 20]).toBe(1); // Core text
      expect(maskResult.mask[9 * 80 + 11]).toBe(1); // Anti-aliased fringe

      // Clean text stroke using background color
      cleanBubbleText(imgData, maskResult.mask, maskResult.avgBgColor);
      ctx.putImageData(imgData, 0, 0);

      // Check cleaned text area is clean white without dark or gray remnants
      const cleanedCorePixel = ctx.getImageData(20, 20, 1, 1).data;
      expect(cleanedCorePixel[0]).toBeGreaterThanOrEqual(250);
      expect(cleanedCorePixel[1]).toBeGreaterThanOrEqual(250);
      expect(cleanedCorePixel[2]).toBeGreaterThanOrEqual(250);

      const cleanedFringePixel = ctx.getImageData(11, 9, 1, 1).data;
      expect(cleanedFringePixel[0]).toBeGreaterThanOrEqual(250);
      expect(cleanedFringePixel[1]).toBeGreaterThanOrEqual(250);
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

    it('Scenario 8: Manually selected region around tight text touching patch boundary is preserved in mask', () => {
      // 50x50 canvas inside uniform speech bubble
      // Dark text stroke touching left edge x=0..15, y=15..35 (compWidth=16, compHeight=21)
      // compWidth > 50 * 0.3 = 15 -> compWidth > width * 0.3 is true, touchesEdge is true
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      // Uniform white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 50, 50);

      // Dark text stroke touching top-left border x=0..16, y=0..21
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 17, 22);

      const imgData = ctx.getImageData(0, 0, 50, 50);

      // Automatic OCR region (isManualRegion = false) -> rejected because touchesEdge && compWidth > 50 * 0.3 = 15
      const autoMaskResult = generateTextMask(imgData, false);
      expect(autoMaskResult.mask[10 * 50 + 10]).toBe(0);

      // Manually selected region (isManualRegion = true) -> preserved because touchesEdge rejection is bypassed
      const manualMaskResult = generateTextMask(imgData, true);
      expect(manualMaskResult.mask[10 * 50 + 10]).toBe(1);
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

    it('Scenario 9: Manually selected text-outside region over clothing inpainting removes text while preserving surrounding clothing color', async () => {
      // 60x60 canvas simulating dark clothing (navy blue #1e293b / RGB 30, 41, 59)
      // with white floating text outside speech bubble in middle
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;

      // Navy clothing background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 60, 60);

      // White floating text stroke in center (25, 25, 10, 10)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, 25, 10, 10);

      const imgData = ctx.getImageData(0, 0, 60, 60);
      const maskResult = generateTextMask(imgData, true, 'text-outside');

      // Verify white text stroke is masked
      expect(maskResult.mask[28 * 60 + 28]).toBe(1);

      // Execute OpenCV Telea Inpainting on text-outside mask
      await inpaintOpenCVTelea(imgData, maskResult.mask);
      ctx.putImageData(imgData, 0, 0);

      // Center pixel where white text was should now be inpainted close to navy clothing color (R < 60, B > 30)
      const inpaintedPixel = ctx.getImageData(28, 28, 1, 1).data;
      expect(inpaintedPixel[0]).toBeLessThan(60); // Red channel preserved as dark
      expect(inpaintedPixel[2]).toBeGreaterThan(30); // Blue channel preserved as navy
    });

    it('Scenario 10: Manually selected text-outside region with white text and dark outline over non-uniform background', () => {
      // 60x60 canvas simulating non-uniform background (e.g. textured/colored artwork)
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;

      // Background: dark gray/colored non-uniform background
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(0, 0, 60, 60);

      // White letter with black outline in center
      // Black outline ring: x=20..39, y=20..39
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, 20, 20);

      // Solid white interior: x=24..35, y=24..35
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(24, 24, 12, 12);

      const imgData = ctx.getImageData(0, 0, 60, 60);

      const maskResult = generateTextMask(imgData, true, 'text-outside');

      // 1. Dark outline pixels are in the cleaning mask
      expect(maskResult.mask[21 * 60 + 21]).toBe(1);

      // 2. Enclosed white interior pixels are also in the cleaning mask
      expect(maskResult.mask[28 * 60 + 28]).toBe(1);

      // 3. Surrounding artwork outside the letter remains UNTOUCHED (mask = 0)
      expect(maskResult.mask[5 * 60 + 5]).toBe(0);
      expect(maskResult.mask[10 * 60 + 10]).toBe(0);
      expect(maskResult.mask[50 * 60 + 50]).toBe(0);
    });
  });
});
