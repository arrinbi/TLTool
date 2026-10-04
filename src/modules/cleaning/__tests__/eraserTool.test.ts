import { describe, it, expect } from 'vitest';
import type { TextRegion } from '../../../types';
import { subtractEraserFromRegion, mergeBrushStrokeToRegion } from '../../../utils/brushUtils';

describe('Eraser Tool Unit & Mask Operations', () => {
  it('1. Eraser removes pixels/areas from a rectangle cleaning mask', () => {
    const region: TextRegion = {
      id: 'region-rect-1',
      bbox: { x: 10, y: 10, width: 50, height: 50 },
      text: 'Sample OCR Text',
      confidence: 95,
      isCleaned: false,
      isManual: true,
    };

    // Erase stroke covering a circle around (25, 25) with radius 10
    const eraserPoints = [{ x: 25, y: 25 }];
    const eraserSize = 20;

    const updatedRegion = subtractEraserFromRegion(
      region,
      eraserPoints,
      eraserSize,
      100,
      100
    );

    expect(updatedRegion.brushMask).toBeDefined();
    expect(updatedRegion.brushMask!.length).toBe(50 * 50);

    // Center pixel (x: 25, y: 25) -> relative in bbox (15, 15) should be erased (0)
    const centerIdx = 15 * 50 + 15;
    expect(updatedRegion.brushMask![centerIdx]).toBe(0);

    // Far corner pixel (x: 55, y: 55) -> relative in bbox (45, 45) should remain intact (1)
    const cornerIdx = 45 * 50 + 45;
    expect(updatedRegion.brushMask![cornerIdx]).toBe(1);
  });

  it('2. Erasing does NOT delete the TextRegion object or clear text', () => {
    const region: TextRegion = {
      id: 'region-rect-2',
      bbox: { x: 10, y: 10, width: 20, height: 20 },
      text: 'Do Not Delete Me',
      confidence: 99,
      isCleaned: false,
      isManual: true,
    };

    // Erase stroke covering 100% of the box
    const eraserPoints = [{ x: 20, y: 20 }];
    const eraserSize = 100;

    const updatedRegion = subtractEraserFromRegion(
      region,
      eraserPoints,
      eraserSize,
      100,
      100
    );

    // Region must still exist and retain its id, text, bbox, confidence
    expect(updatedRegion.id).toBe('region-rect-2');
    expect(updatedRegion.text).toBe('Do Not Delete Me');
    expect(updatedRegion.bbox).toEqual({ x: 10, y: 10, width: 20, height: 20 });
    expect(updatedRegion.confidence).toBe(99);

    // All pixels in mask should be 0
    let sum = 0;
    for (let i = 0; i < updatedRegion.brushMask!.length; i++) {
      sum += updatedRegion.brushMask![i];
    }
    expect(sum).toBe(0);
  });

  it('3. Erasing on non-intersecting coordinates leaves the region mask unchanged', () => {
    const region: TextRegion = {
      id: 'region-rect-3',
      bbox: { x: 10, y: 10, width: 20, height: 20 },
      text: 'Far Away Text',
      confidence: 90,
      isCleaned: false,
    };

    const eraserPoints = [{ x: 80, y: 80 }];
    const eraserSize = 10;

    const updatedRegion = subtractEraserFromRegion(
      region,
      eraserPoints,
      eraserSize,
      100,
      100
    );

    expect(updatedRegion).toBe(region);
  });

  it('4. Allows freely alternating Brush -> Eraser -> Brush -> Eraser', () => {
    let region: TextRegion = {
      id: 'region-multi',
      bbox: { x: 10, y: 10, width: 30, height: 30 },
      text: 'Multi Tool Text',
      confidence: 95,
      isCleaned: false,
    };

    // 1. Brush stroke
    region = mergeBrushStrokeToRegion(
      region,
      [{ x: 15, y: 15 }, { x: 25, y: 25 }],
      10,
      100,
      100
    );
    expect(region.brushMask).toBeDefined();

    // 2. Eraser stroke
    region = subtractEraserFromRegion(
      region,
      [{ x: 15, y: 15 }],
      8,
      100,
      100
    );
    expect(region.brushMask![(15 - region.bbox.y) * region.bbox.width + (15 - region.bbox.x)]).toBe(0);

    // 3. Brush stroke again
    region = mergeBrushStrokeToRegion(
      region,
      [{ x: 15, y: 15 }],
      6,
      100,
      100
    );
    expect(region.brushMask![(15 - region.bbox.y) * region.bbox.width + (15 - region.bbox.x)]).toBe(1);

    // 4. Eraser stroke again
    region = subtractEraserFromRegion(
      region,
      [{ x: 15, y: 15 }],
      6,
      100,
      100
    );
    expect(region.brushMask![(15 - region.bbox.y) * region.bbox.width + (15 - region.bbox.x)]).toBe(0);
  });
});
