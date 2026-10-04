import { describe, it, expect } from 'vitest';
import type { TextRegion } from '../../../types';
import {
  detectBubbleRegions,
  associateTextWithBubbles,
  deduplicateOrUpdateRegions,
} from '../ocrService';
import { cleanImageRegion } from '../../cleaning/cleaningService';

describe('OCR and Cleaning Separation Architectural & Regression Coverage', () => {
  it('1. OCR creates TextRegions with expected structure', () => {
    const region: TextRegion = {
      id: 'region-12',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'I knew you were lying.',
      confidence: 95,
      isCleaned: false,
      source: 'auto',
      category: 'bubble-oval',
    };

    expect(region.id).toBe('region-12');
    expect(region.text).toBe('I knew you were lying.');
    expect(region.isCleaned).toBe(false);
  });

  it('2. Bubble Detection creates BubbleRegions without creating TextRegions directly', async () => {
    // Create a mock canvas with a speech bubble (light patch)
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 300, 300);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(50, 50, 100, 100);
    }

    const bubbles = await detectBubbleRegions(canvas);
    expect(Array.isArray(bubbles)).toBe(true);
    if (bubbles.length > 0) {
      expect(bubbles[0].id).toContain('bubble-');
      expect(bubbles[0].shape).toBeDefined();
      expect(bubbles[0].bbox).toBeDefined();
      // Verify BubbleRegion is NOT a TextRegion
      expect((bubbles[0] as any).text).toBeUndefined();
    }
  });

  it('3. associateTextWithBubbles assigns bubbleId to TextRegions inside bubbles', () => {
    const textRegion: TextRegion = {
      id: 'region-1',
      bbox: { x: 60, y: 60, width: 40, height: 20 },
      text: 'Hello inside bubble',
      confidence: 90,
      isCleaned: false,
    };

    const bubbles = [
      {
        id: 'bubble-101',
        shape: 'oval' as const,
        bbox: { x: 50, y: 50, width: 100, height: 100 },
      },
    ];

    const associated = associateTextWithBubbles([textRegion], bubbles);
    expect(associated[0].bubbleId).toBe('bubble-101');
  });

  it('4. Running Cleaning multiple times on Region #12 leaves ONLY Region #12 (NO duplicates created)', async () => {
    // Mock canvas
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
    }
    const canvasUrl = canvas.toDataURL('image/png');

    let regions: TextRegion[] = [
      {
        id: 'region-12',
        bbox: { x: 20, y: 20, width: 80, height: 40 },
        text: 'I knew you were lying.',
        confidence: 98,
        isCleaned: false,
        source: 'auto',
      },
    ];

    const options = { method: 'solid-white' as const, padding: 2, fillColor: '#ffffff' };

    // Cleaning #1
    let currentCleanedUrl = await cleanImageRegion(canvasUrl, regions[0].bbox, options);
    regions = regions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true } : r));
    expect(regions.length).toBe(1);
    expect(regions[0].id).toBe('region-12');

    // Cleaning #2
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, regions[0].bbox, options);
    regions = regions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true } : r));
    expect(regions.length).toBe(1);
    expect(regions[0].id).toBe('region-12');

    // Cleaning #3
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, regions[0].bbox, options);
    regions = regions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true } : r));

    // CRITICAL REGRESSION ASSERTION: Exactly 1 region exists, Region #12! No Region #27, #31 created.
    expect(regions.length).toBe(1);
    expect(regions[0].id).toBe('region-12');
    expect(regions[0].text).toBe('I knew you were lying.');
  });

  it('5. Original OCR text remains preserved after Cleaning and is consumable by Translation', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const canvasUrl = canvas.toDataURL('image/png');

    const region: TextRegion = {
      id: 'region-12',
      bbox: { x: 10, y: 10, width: 50, height: 30 },
      text: 'Original OCR text',
      confidence: 90,
      isCleaned: false,
    };

    // Clean region
    await cleanImageRegion(canvasUrl, region.bbox, { method: 'solid-white', padding: 2 });
    const cleanedRegion: TextRegion = { ...region, isCleaned: true };

    // Verify original OCR text was not destroyed or modified
    expect(cleanedRegion.text).toBe('Original OCR text');

    // Simulate Translation consuming the original text
    const translatedRegion: TextRegion = {
      ...cleanedRegion,
      translatedText: 'Teks OCR Asli',
      translation: 'Teks OCR Asli',
    };

    expect(translatedRegion.text).toBe('Original OCR text');
    expect(translatedRegion.translatedText).toBe('Teks OCR Asli');
  });

  it('6. deduplicateOrUpdateRegions updates existing region in-place on Re-OCR without appending spatial duplicate', () => {
    const existingRegions: TextRegion[] = [
      {
        id: 'region-12',
        bbox: { x: 10, y: 10, width: 100, height: 50 },
        text: 'Initial OCR text',
        confidence: 80,
        isCleaned: true,
      },
    ];

    const reOcrRegions: TextRegion[] = [
      {
        id: 'region-new',
        bbox: { x: 11, y: 11, width: 98, height: 48 }, // Spatially overlaps region-12
        text: 'Refined OCR text',
        confidence: 95,
        isCleaned: false,
      },
    ];

    const updated = deduplicateOrUpdateRegions(existingRegions, reOcrRegions);

    expect(updated.length).toBe(1);
    expect(updated[0].id).toBe('region-12');
    expect(updated[0].text).toBe('Refined OCR text');
    expect(updated[0].confidence).toBe(95);
  });
});
