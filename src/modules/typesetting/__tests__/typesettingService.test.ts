import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import type { TextRegion } from '../../../types';
import {
  getEffectiveTypesettingBounds,
  getEffectiveTypesettingStyle,
  getRenderedTextDetails,
  calculateAutoFontSize,
  renderRegionTypesetting,
  MIN_FONT_SIZE,
} from '../typesettingService';

describe('Typesetting Service & Geometry Logic', () => {
  const sampleRegion: TextRegion = {
    id: 'region-1',
    bbox: { x: 100, y: 100, width: 200, height: 100 },
    text: 'Original OCR Text',
    confidence: 95,
    isCleaned: true,
    translatedText: 'Halo Dunia',
  };

  it('typesetting box defaults to OCR bbox when no custom bounds are defined', () => {
    const bounds = getEffectiveTypesettingBounds(sampleRegion);
    expect(bounds).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('uses custom typesetting bounds when defined without modifying OCR bbox', () => {
    const customRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        bounds: { x: 120, y: 110, width: 180, height: 90 },
      },
    };

    const bounds = getEffectiveTypesettingBounds(customRegion);
    expect(bounds).toEqual({ x: 120, y: 110, width: 180, height: 90 });
    // Verify original OCR bbox remains completely unchanged
    expect(customRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('calculates rendered text center and box center accurately', () => {
    const details = getRenderedTextDetails(sampleRegion);

    // Box center for bbox {100, 100, 200, 100} is (200, 150)
    expect(details.boxCenter).toEqual({ x: 200, y: 150 });
    expect(details.bounds).toEqual({ x: 100, y: 100, width: 200, height: 100 });
    expect(details.padding).toBe(4);
    expect(details.innerBounds).toEqual({ x: 104, y: 104, width: 192, height: 92 });
  });

  it('measures horizontal centering when align is center', () => {
    const centeredRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        align: 'center',
        vAlign: 'top',
      },
    };

    const details = getRenderedTextDetails(centeredRegion);
    expect(details.isHorizontallyCentered).toBe(true);
  });

  it('measures vertical centering when vAlign is middle', () => {
    const vCenteredRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        align: 'left',
        vAlign: 'middle',
      },
    };

    const details = getRenderedTextDetails(vCenteredRegion);
    expect(details.isVerticallyCentered).toBe(true);
  });

  it('reports alignmentStatus as Centered when both horizontally and vertically centered', () => {
    const centeredBothRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        align: 'center',
        vAlign: 'middle',
      },
    };

    const details = getRenderedTextDetails(centeredBothRegion);
    expect(details.isHorizontallyCentered).toBe(true);
    expect(details.isVerticallyCentered).toBe(true);
    expect(details.alignmentStatus).toBe('Centered');
  });

  it('reports alignmentStatus as Needs adjustment when text is off-center', () => {
    const offCenterRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        bounds: { x: 500, y: 500, width: 300, height: 100 },
        align: 'left',
        vAlign: 'top',
      },
    };

    const details = getRenderedTextDetails(offCenterRegion);
    expect(details.alignmentStatus).toBe('Needs adjustment');
  });

  it('padding reduces the usable inner text area without altering OCR bbox', () => {
    const paddedRegion: TextRegion = {
      ...sampleRegion,
      typesetting: {
        padding: 20,
      },
    };

    const details = getRenderedTextDetails(paddedRegion);
    expect(details.padding).toBe(20);
    expect(details.innerBounds).toEqual({ x: 120, y: 120, width: 160, height: 60 });
    expect(paddedRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('auto-fit calculates font size fitting inside usable typesetting box area and respects MIN_FONT_SIZE', () => {
    const text = 'Sangat Panjang Sekali Teks Ini Untuk Di Muat';
    const style = getEffectiveTypesettingStyle(sampleRegion);

    const autoFit = calculateAutoFontSize(sampleRegion, text, style);
    expect(autoFit.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(autoFit.lines.length).toBeGreaterThan(0);
  });

  it('existing typesetting canvas rendering continues working non-destructively', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    expect(() => {
      renderRegionTypesetting(ctx, sampleRegion);
    }).not.toThrow();

    expect(sampleRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });
});
