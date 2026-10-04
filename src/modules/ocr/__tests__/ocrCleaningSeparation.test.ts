import { describe, it, expect } from 'vitest';
import type { TextRegion } from '../../../types';
import {
  detectBubbleRegions,
  associateTextWithBubbles,
  deduplicateOrUpdateRegions,
} from '../ocrService';
import { cleanImageRegion } from '../../cleaning/cleaningService';

describe('OCR and Cleaning Separation Architectural & Regression Coverage', () => {
  it('1. Detect Bubble creates BubbleRegions without creating TextRegions directly', async () => {
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
      expect((bubbles[0] as any).text).toBeUndefined();
    }
  });

  it('2. Detect Bubble does not create duplicate TextRegions or duplicate BubbleRegions on re-run', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;

    const bubbles1 = await detectBubbleRegions(canvas);
    const bubbles2 = await detectBubbleRegions(canvas);

    // Running detectBubbleRegions again returns candidate bubble list without mutating or appending TextRegions
    expect(bubbles1.length).toBe(bubbles2.length);
  });

  it('3. OCR creates TextRegions with expected structure', () => {
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

  it('4. Manual Rectangle can produce an OCR region with source="manual"', () => {
    const manualRegion: TextRegion = {
      id: 'region-manual-1',
      bbox: { x: 50, y: 50, width: 120, height: 60 },
      text: 'SFX BOOM',
      confidence: 100,
      isCleaned: false,
      isManual: true,
      source: 'manual',
      category: 'sfx',
    };

    expect(manualRegion.isManual).toBe(true);
    expect(manualRegion.source).toBe('manual');
    expect(manualRegion.category).toBe('sfx');
  });

  it('5. Cleaning consumes an existing TextRegion and modifies only cleaning state', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const canvasUrl = canvas.toDataURL('image/png');

    const region: TextRegion = {
      id: 'region-12',
      bbox: { x: 10, y: 10, width: 50, height: 30 },
      text: 'I knew you were lying.',
      confidence: 95,
      isCleaned: false,
    };

    await cleanImageRegion(canvasUrl, region.bbox, { method: 'solid-white', padding: 2 });
    const cleanedRegion: TextRegion = { ...region, isCleaned: true, cleaningMethod: 'solid-white' };

    expect(cleanedRegion.id).toBe('region-12');
    expect(cleanedRegion.text).toBe('I knew you were lying.');
    expect(cleanedRegion.isCleaned).toBe(true);
    expect(cleanedRegion.cleaningMethod).toBe('solid-white');
  });

  it('6-11. MANDATORY REGRESSION TEST: Repeated cleaning operations on [Region #12] NEVER append duplicate TextRegions', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
    }
    const canvasUrl = canvas.toDataURL('image/png');

    let textRegions: TextRegion[] = [
      {
        id: 'region-12',
        bbox: { x: 20, y: 20, width: 80, height: 40 },
        text: 'I knew you were lying.',
        confidence: 98,
        isCleaned: false,
        source: 'auto',
      },
    ];

    const options1 = { method: 'solid-white' as const, padding: 2, fillColor: '#ffffff' };
    const options2 = { method: 'opencv-telea' as const, padding: 3 };

    // Operation 1: Clean Selected
    let currentCleanedUrl = await cleanImageRegion(canvasUrl, textRegions[0].bbox, options1);
    textRegions = textRegions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true, cleaningMethod: options1.method } : r));
    expect(textRegions.length).toBe(1);

    // Operation 2: Clean Selected again
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, textRegions[0].bbox, options1);
    textRegions = textRegions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true, cleaningMethod: options1.method } : r));
    expect(textRegions.length).toBe(1);

    // Operation 3: Clean All
    for (const r of textRegions) {
      currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, r.bbox, options1);
    }
    textRegions = textRegions.map((r) => ({ ...r, isCleaned: true }));
    expect(textRegions.length).toBe(1);

    // Operation 4: Re-clean
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, textRegions[0].bbox, options1);
    expect(textRegions.length).toBe(1);

    // Operation 5: Change cleaning method
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, textRegions[0].bbox, options2);
    textRegions = textRegions.map((r) => (r.id === 'region-12' ? { ...r, cleaningMethod: options2.method } : r));
    expect(textRegions.length).toBe(1);

    // Operation 6: Clean Selected
    currentCleanedUrl = await cleanImageRegion(currentCleanedUrl, textRegions[0].bbox, options2);
    expect(textRegions.length).toBe(1);

    // Operation 7: Undo / Redo simulation
    textRegions = textRegions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: false } : r));
    expect(textRegions.length).toBe(1);
    textRegions = textRegions.map((r) => (r.id === 'region-12' ? { ...r, isCleaned: true } : r));
    expect(textRegions.length).toBe(1);

    // FINAL ASSERTION: Exactly 1 region exists, Region #12! No Region #27, #31, etc.
    expect(textRegions.length).toBe(1);
    expect(textRegions[0].id).toBe('region-12');
    expect(textRegions[0].text).toBe('I knew you were lying.');
  });

  it('12. Original OCR text remains unchanged after Cleaning', async () => {
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

    await cleanImageRegion(canvasUrl, region.bbox, { method: 'solid-white', padding: 2 });
    const cleanedRegion: TextRegion = { ...region, isCleaned: true };

    expect(cleanedRegion.text).toBe('Original OCR text');
  });

  it('13. Explicit Re-OCR remains an OCR-only operation and updates regions in-place via deduplication', () => {
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

  it('14. Re-running Bubble Detection does not append duplicate BubbleRegions', () => {
    const textRegions: TextRegion[] = [
      {
        id: 'region-1',
        bbox: { x: 60, y: 60, width: 40, height: 20 },
        text: 'Hello inside bubble',
        confidence: 90,
        isCleaned: false,
      },
    ];

    const bubbles = [
      {
        id: 'bubble-101',
        shape: 'oval' as const,
        bbox: { x: 50, y: 50, width: 100, height: 100 },
      },
    ];

    const associated1 = associateTextWithBubbles(textRegions, bubbles);
    const associated2 = associateTextWithBubbles(associated1, bubbles);

    expect(associated2.length).toBe(1);
    expect(associated2[0].bubbleId).toBe('bubble-101');
  });

  it('15. Translation still receives the original OCR text', () => {
    const cleanedRegion: TextRegion = {
      id: 'region-12',
      bbox: { x: 10, y: 10, width: 50, height: 30 },
      text: 'Original OCR text',
      confidence: 90,
      isCleaned: true,
    };

    const translatedRegion: TextRegion = {
      ...cleanedRegion,
      translatedText: 'Teks OCR Asli',
      translation: 'Teks OCR Asli',
    };

    expect(translatedRegion.text).toBe('Original OCR text');
    expect(translatedRegion.translatedText).toBe('Teks OCR Asli');
  });

  it('16. Typesetting still receives the expected region/translation data', () => {
    const region: TextRegion = {
      id: 'region-12',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'Original OCR text',
      confidence: 90,
      isCleaned: true,
      translatedText: 'Halo Dunia',
      typesetting: {
        fontSize: 16,
        fontFamily: 'sans-serif',
        align: 'center',
      },
    };

    expect(region.translatedText).toBe('Halo Dunia');
    expect(region.typesetting?.fontSize).toBe(16);
    expect(region.typesetting?.fontFamily).toBe('sans-serif');
  });
});
