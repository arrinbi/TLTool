import { describe, it, expect } from 'vitest';
import {
  areBoxesNear,
  mergeBoxes,
  areUnitsInSameRegion,
  clusterBoxes,
  classifyRegionCategory,
  computeOverlapRatio,
  deduplicateTextUnits,
  preprocessCanvasVariants,
} from '../ocrService';
import type { BoundingBox } from '../../../types';
import type { TextUnit } from '../ocrService';

describe('OCR Service Helper Functions', () => {
  it('correctly detects near bounding boxes', () => {
    const box1: BoundingBox = { x: 10, y: 10, width: 100, height: 20 };
    const box2: BoundingBox = { x: 10, y: 35, width: 100, height: 20 }; // 5px gap
    const box3: BoundingBox = { x: 10, y: 200, width: 100, height: 20 }; // far gap

    expect(areBoxesNear(box1, box2, 20)).toBe(true);
    expect(areBoxesNear(box1, box3, 20)).toBe(false);
  });

  it('correctly merges bounding boxes', () => {
    const box1: BoundingBox = { x: 10, y: 10, width: 50, height: 20 };
    const box2: BoundingBox = { x: 40, y: 25, width: 60, height: 30 };

    const merged = mergeBoxes([box1, box2]);
    expect(merged).toEqual({
      x: 10,
      y: 10,
      width: 90, // max X is 40+60 = 100, 100 - 10 = 90
      height: 45, // max Y is 25+30 = 55, 55 - 10 = 45
    });
  });

  it('correctly evaluates units in same region using font-relative proximity', () => {
    const word1 = { bbox: { x: 50, y: 50, width: 40, height: 20 }, text: 'Hello', confidence: 90 };
    const word2 = { bbox: { x: 95, y: 50, width: 50, height: 20 }, text: 'World', confidence: 90 }; // 5px gap on same line
    const word3 = { bbox: { x: 50, y: 75, width: 80, height: 20 }, text: 'Line2', confidence: 90 }; // 5px vertical gap
    const wordDistant = { bbox: { x: 400, y: 400, width: 60, height: 20 }, text: 'Far', confidence: 85 };

    expect(areUnitsInSameRegion(word1, word2)).toBe(true);
    expect(areUnitsInSameRegion(word1, word3)).toBe(true);
    expect(areUnitsInSameRegion(word1, wordDistant)).toBe(false);
  });

  it('clusters adjacent words into tight, separate text regions', () => {
    const items = [
      // Bubble 1 (Top Left)
      { bbox: { x: 50, y: 50, width: 40, height: 18 }, text: 'WHAT', confidence: 95 },
      { bbox: { x: 95, y: 50, width: 15, height: 18 }, text: 'IS', confidence: 95 },
      { bbox: { x: 115, y: 50, width: 40, height: 18 }, text: 'THIS?!', confidence: 95 },
      { bbox: { x: 50, y: 75, width: 100, height: 18 }, text: 'IT CANNOT BE!', confidence: 95 },

      // Bubble 2 (Top Right - separated horizontally)
      { bbox: { x: 500, y: 50, width: 120, height: 18 }, text: 'HE IS COMING...', confidence: 95 },
    ];

    const clusters = clusterBoxes(items);
    expect(clusters.length).toBe(2);

    // Bounding box of cluster 1 should tightly cover x=50..155 (width 105 + 4px padding = 109)
    expect(clusters[0].bbox.x).toBe(48); // 50 - 2
    expect(clusters[0].bbox.y).toBe(48); // 50 - 2
    expect(clusters[0].bbox.width).toBe(109); // max X is 155, min X is 50. (155-50) + 4 = 109
    expect(clusters[0].text).toBe('WHAT IS THIS?!\nIT CANNOT BE!');

    expect(clusters[1].text).toBe('HE IS COMING...');
  });

  it('classifies region category correctly based on text & shape', () => {
    const sfxBox: BoundingBox = { x: 100, y: 100, width: 200, height: 80 };
    expect(classifyRegionCategory(sfxBox, 'BOOM!!')).toBe('sfx');

    const ovalBox: BoundingBox = { x: 100, y: 100, width: 120, height: 100 }; // Aspect ratio ~1.2
    expect(classifyRegionCategory(ovalBox, 'Normal speech text')).toBe('bubble-oval');

    const rectBox: BoundingBox = { x: 100, y: 100, width: 300, height: 80 }; // Aspect ratio ~3.75
    expect(classifyRegionCategory(rectBox, 'System notification message')).toBe('bubble-rect');
  });

  describe('Bounding Box Accuracy Requirements', () => {
    it('text inside a speech bubble: bounds text tightly without expanding to speech bubble boundary', () => {
      // Speech bubble region is [100, 100, 300, 200], but text is centered inside
      const textWords = [
        { bbox: { x: 180, y: 170, width: 60, height: 20 }, text: 'Hello', confidence: 95 },
        { bbox: { x: 250, y: 170, width: 50, height: 20 }, text: 'there!', confidence: 95 },
      ];

      const clusters = clusterBoxes(textWords);
      expect(clusters.length).toBe(1);

      const bbox = clusters[0].bbox;
      // Actual text spans x=180..300, y=170..190. With 2px padding: x=178, y=168, w=124, h=24
      expect(bbox.x).toBe(178);
      expect(bbox.y).toBe(168);
      expect(bbox.width).toBe(124);
      expect(bbox.height).toBe(24);

      // Verify the box is much smaller than the full speech bubble (300x200)
      expect(bbox.width).toBeLessThan(200);
      expect(bbox.height).toBeLessThan(50);
    });

    it('multi-line text: forms a single tight box enclosing the complete text block without empty margins', () => {
      const line1 = [
        { bbox: { x: 200, y: 100, width: 50, height: 20 }, text: 'FIRST', confidence: 90 },
        { bbox: { x: 255, y: 100, width: 45, height: 20 }, text: 'LINE', confidence: 90 },
      ];
      const line2 = [
        { bbox: { x: 195, y: 125, width: 65, height: 20 }, text: 'SECOND', confidence: 90 },
        { bbox: { x: 265, y: 125, width: 40, height: 20 }, text: 'LINE', confidence: 90 },
      ];

      const clusters = clusterBoxes([...line1, ...line2]);
      expect(clusters.length).toBe(1);

      const bbox = clusters[0].bbox;
      // Combined text spans x=195..305, y=100..145
      // With 2px padding: x=193, y=98, width=114, height=49
      expect(bbox.x).toBe(193);
      expect(bbox.y).toBe(98);
      expect(bbox.width).toBe(114);
      expect(bbox.height).toBe(49);
      expect(clusters[0].text).toBe('FIRST LINE\nSECOND LINE');
    });

    it('small wild text over artwork: tightly fits detected text pixels', () => {
      const wildWord = [
        { bbox: { x: 320, y: 450, width: 35, height: 14 }, text: 'gasp', confidence: 85 },
      ];

      const clusters = clusterBoxes(wildWord);
      expect(clusters.length).toBe(1);

      const bbox = clusters[0].bbox;
      expect(bbox.x).toBe(318); // 320 - 2
      expect(bbox.y).toBe(448); // 450 - 2
      expect(bbox.width).toBe(39); // 35 + 4
      expect(bbox.height).toBe(18); // 14 + 4
    });

    it('SFX: tightly follows actual text', () => {
      const sfxWords = [
        { bbox: { x: 50, y: 300, width: 180, height: 75 }, text: 'KABOOM!!', confidence: 98 },
      ];

      const clusters = clusterBoxes(sfxWords);
      expect(clusters.length).toBe(1);

      const bbox = clusters[0].bbox;
      expect(bbox.x).toBe(48); // 50 - 2
      expect(bbox.y).toBe(298); // 300 - 2
      expect(bbox.width).toBe(184); // 180 + 4
      expect(bbox.height).toBe(79); // 75 + 4
      expect(clusters[0].category).toBe('sfx');
    });

    it('two separate nearby text regions: stay as separate distinct boxes without merging', () => {
      // Two separate text boxes side by side or vertically separated beyond threshold gap
      const leftText = [
        { bbox: { x: 100, y: 200, width: 50, height: 20 }, text: 'Left', confidence: 90 },
      ];
      const rightText = [
        { bbox: { x: 220, y: 200, width: 60, height: 20 }, text: 'Right', confidence: 90 },
      ];

      const clusters = clusterBoxes([...leftText, ...rightText]);
      expect(clusters.length).toBe(2);

      expect(clusters[0].text).toBe('Left');
      expect(clusters[1].text).toBe('Right');
      expect(clusters[0].bbox.x + clusters[0].bbox.width).toBeLessThan(clusters[1].bbox.x);
    });

    it('text near artwork/line art: tightly bounds text without capturing surrounding area', () => {
      const textNearArtwork = [
        { bbox: { x: 400, y: 150, width: 80, height: 22 }, text: 'Whisper...', confidence: 92 },
      ];

      const clusters = clusterBoxes(textNearArtwork);
      expect(clusters.length).toBe(1);

      const bbox = clusters[0].bbox;
      // Box strictly bounds text [400,150,80,22] + 2px padding => [398,148,84,26]
      expect(bbox.x).toBe(398);
      expect(bbox.y).toBe(148);
      expect(bbox.width).toBe(84);
      expect(bbox.height).toBe(26);
    });
  });

  describe('Multi-Pass OCR Preprocessing & Deduplication', () => {
    it('computes spatial overlap ratio accurately', () => {
      const box1: BoundingBox = { x: 100, y: 100, width: 100, height: 50 };
      const box2: BoundingBox = { x: 100, y: 100, width: 100, height: 50 }; // Exact match
      const box3: BoundingBox = { x: 150, y: 100, width: 100, height: 50 }; // 50% overlap
      const boxFar: BoundingBox = { x: 500, y: 500, width: 50, height: 20 };

      expect(computeOverlapRatio(box1, box2)).toBe(1.0);
      expect(computeOverlapRatio(box1, box3)).toBeCloseTo(0.5);
      expect(computeOverlapRatio(box1, boxFar)).toBe(0);
    });

    it('deduplicates multi-pass OCR text units while keeping higher confidence and symbol-refined geometry', () => {
      const pass1Units: TextUnit[] = [
        { bbox: { x: 100, y: 100, width: 80, height: 25 }, text: 'SPEECH', confidence: 92 },
        { bbox: { x: 190, y: 100, width: 60, height: 25 }, text: 'TEXT', confidence: 88 },
      ];

      // Pass 2 duplicate with slightly lower confidence
      const pass2Units: TextUnit[] = [
        { bbox: { x: 102, y: 100, width: 78, height: 25 }, text: 'SPEECH', confidence: 75 },
      ];

      // Pass 3 inverted pass unit for white SFX over dark artwork ("BAM!")
      const pass3Units: TextUnit[] = [
        { bbox: { x: 300, y: 400, width: 120, height: 60 }, text: 'BAM!', confidence: 95 },
      ];

      // Low confidence punctuation noise
      const noiseUnit: TextUnit = {
        bbox: { x: 20, y: 20, width: 5, height: 5 },
        text: '.',
        confidence: 15,
      };

      const combined = deduplicateTextUnits([...pass1Units, ...pass2Units, ...pass3Units, noiseUnit]);

      expect(combined.length).toBe(3);
      const texts = combined.map((u) => u.text);
      expect(texts).toContain('SPEECH');
      expect(texts).toContain('TEXT');
      expect(texts).toContain('BAM!');
      expect(texts).not.toContain('.');
    });

    it('preprocesses canvas into standard, contrast, and inverted variants', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 200, 200);
      }

      const variants = preprocessCanvasVariants(canvas);
      expect(variants.standard).toBeDefined();
      expect(variants.contrast).toBeDefined();
      expect(variants.inverted).toBeDefined();
      expect(variants.standard.width).toBe(200);
      expect(variants.contrast.height).toBe(200);
      expect(variants.inverted.width).toBe(200);
    });
  });
});
