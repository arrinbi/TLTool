import { describe, it, expect } from 'vitest';
import {
  areBoxesNear,
  mergeBoxes,
  areUnitsInSameRegion,
  clusterBoxes,
  classifyRegionCategory,
} from '../ocrService';
import type { BoundingBox } from '../../../types';

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

    // Bounding box of cluster 1 should tightly cover x=50..155 (width 105 + 8px padding = 113)
    expect(clusters[0].bbox.x).toBe(46); // 50 - 4
    expect(clusters[0].bbox.y).toBe(46); // 50 - 4
    expect(clusters[0].bbox.width).toBe(113); // max X is 155, min X is 50. (155-50) + 8 = 113
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
});
