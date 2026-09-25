import { describe, it, expect } from 'vitest';
import { areBoxesNear, mergeBoxes, clusterBoxes } from '../ocrService';
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

  it('clusters adjacent text line boxes into speech bubble regions', () => {
    const items = [
      { bbox: { x: 50, y: 50, width: 100, height: 20 }, text: 'Hello', confidence: 90 },
      { bbox: { x: 50, y: 75, width: 120, height: 20 }, text: 'World!', confidence: 95 },
      { bbox: { x: 400, y: 400, width: 80, height: 20 }, text: 'Isolated', confidence: 85 },
    ];

    const clusters = clusterBoxes(items, 30);
    expect(clusters.length).toBe(2);
    expect(clusters[0].text).toBe('Hello\nWorld!');
    expect(clusters[1].text).toBe('Isolated');
  });
});
