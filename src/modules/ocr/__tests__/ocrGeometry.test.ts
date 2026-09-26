import { describe, it, expect } from 'vitest';
import {
  extractTextUnitsFromBlocks,
  clusterBoxes,
  mergeBoxes,
} from '../ocrService';

describe('OCR Geometry Extraction & Clustering Pipeline', () => {
  describe('Requirement 10: Distinguishing Raw Word, Clustered, and Final Displayed Bounding Boxes', () => {
    it('distinguishes between (A) raw word geometry, (B) clustered text geometry, and (C) final displayed bounding box', () => {
      // Mock Tesseract block output hierarchy
      const mockBlocks = [
        {
          bbox: { x0: 50, y0: 50, x1: 500, y1: 300 }, // Large block box
          paragraphs: [
            {
              bbox: { x0: 60, y0: 60, x1: 450, y1: 250 }, // Large paragraph box
              lines: [
                {
                  bbox: { x0: 100, y0: 100, x1: 250, y1: 120 },
                  text: 'Speech text',
                  words: [
                    { bbox: { x0: 100, y0: 100, x1: 160, y1: 120 }, text: 'Speech', confidence: 95 },
                    { bbox: { x0: 170, y0: 100, x1: 210, y1: 120 }, text: 'text', confidence: 95 },
                  ],
                },
              ],
            },
          ],
        },
      ];

      // A. Raw Tesseract word geometry
      const rawUnits = extractTextUnitsFromBlocks(mockBlocks);
      expect(rawUnits.length).toBe(2);
      expect(rawUnits[0].bbox).toEqual({ x: 100, y: 100, width: 60, height: 20 });
      expect(rawUnits[1].bbox).toEqual({ x: 170, y: 100, width: 40, height: 20 });

      // B. Clustered text geometry (unpadded merge of word boxes)
      const clusteredUnpaddedBox = mergeBoxes(rawUnits.map((u) => u.bbox));
      expect(clusteredUnpaddedBox).toEqual({
        x: 100,
        y: 100,
        width: 110, // 170 + 40 - 100 = 110
        height: 20,
      });

      // C. Final displayed bounding box (with tight safety padding, e.g., +2px)
      const regions = clusterBoxes(rawUnits);
      expect(regions.length).toBe(1);
      const finalDisplayedBox = regions[0].bbox;
      expect(finalDisplayedBox).toEqual({
        x: 98, // 100 - 2
        y: 98, // 100 - 2
        width: 114, // 110 + 4
        height: 24, // 20 + 4
      });

      // Verify that final displayed box is based on raw word geometry, NOT paragraph or block geometry
      expect(finalDisplayedBox.width).toBeLessThan(mockBlocks[0].bbox.x1 - mockBlocks[0].bbox.x0);
      expect(finalDisplayedBox.height).toBeLessThan(mockBlocks[0].bbox.y1 - mockBlocks[0].bbox.y0);
    });
  });

  describe('Requirement 12: Failing test if Paragraph/Block-level box is incorrectly used', () => {
    it('fails if paragraph or block-level bounding box is used instead of word/line geometry', () => {
      // In speech bubbles on manhwa pages, Tesseract's paragraph/block bbox often extends over empty white space inside or around the bubble.
      const mockBlocks = [
        {
          bbox: { x0: 100, y0: 100, x1: 400, y1: 300 }, // Block: 300x200
          paragraphs: [
            {
              bbox: { x0: 110, y0: 110, x1: 390, y1: 290 }, // Paragraph: 280x180
              lines: [
                {
                  bbox: { x0: 200, y0: 180, x1: 280, y1: 200 },
                  text: 'HELP!',
                  words: [
                    { bbox: { x0: 200, y0: 180, x1: 280, y1: 200 }, text: 'HELP!', confidence: 99 },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const rawUnits = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(rawUnits);

      expect(regions.length).toBe(1);
      const finalBox = regions[0].bbox;

      // The actual text is strictly bounded at x=200..280 (width 80), y=180..200 (height 20).
      // With padding = 2, finalBox is x: 198, y: 178, width: 84, height: 24.
      expect(finalBox.width).toBe(84);
      expect(finalBox.height).toBe(24);

      // If paragraph/block bbox were used, width would be ~280 and height ~180.
      const paragraphWidth = mockBlocks[0].paragraphs[0].bbox.x1 - mockBlocks[0].paragraphs[0].bbox.x0;
      const blockWidth = mockBlocks[0].bbox.x1 - mockBlocks[0].bbox.x0;

      expect(finalBox.width).toBeLessThan(paragraphWidth / 2);
      expect(finalBox.height).toBeLessThan(100);
      expect(finalBox.width).not.toEqual(paragraphWidth);
      expect(finalBox.width).not.toEqual(blockWidth);
    });
  });

  describe('Requirement 11: Regression Tests for Specific Manhwa Layout Scenarios', () => {
    it('1. Single word inside a speech bubble: bounds text tightly', () => {
      const mockBlocks = [
        {
          bbox: { x0: 150, y0: 200, x1: 450, y1: 400 }, // Wide bubble area
          paragraphs: [
            {
              bbox: { x0: 160, y0: 210, x1: 440, y1: 390 },
              lines: [
                {
                  bbox: { x0: 280, y0: 290, x1: 340, y1: 310 },
                  text: 'WAIT',
                  words: [{ bbox: { x0: 280, y0: 290, x1: 340, y1: 310 }, text: 'WAIT', confidence: 98 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].bbox).toEqual({ x: 278, y: 288, width: 64, height: 24 });
    });

    it('2. Two words on one line: keeps them grouped into a single tight line box', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 100, y0: 100, x1: 220, y1: 120 },
                  words: [
                    { bbox: { x0: 100, y0: 100, x1: 150, y1: 120 }, text: 'LOOK', confidence: 95 },
                    { bbox: { x0: 160, y0: 100, x1: 220, y1: 120 }, text: 'HERE', confidence: 95 },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].text).toBe('LOOK HERE');
      expect(regions[0].bbox).toEqual({ x: 98, y: 98, width: 124, height: 24 });
    });

    it('3. Multiple lines: groups lines belonging to the same text block into one region', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 100, y0: 100, x1: 200, y1: 120 },
                  words: [
                    { bbox: { x0: 100, y0: 100, x1: 140, y1: 120 }, text: 'LINE', confidence: 95 },
                    { bbox: { x0: 150, y0: 100, x1: 200, y1: 120 }, text: 'ONE', confidence: 95 },
                  ],
                },
                {
                  bbox: { x0: 100, y0: 128, x1: 200, y1: 148 },
                  words: [
                    { bbox: { x0: 100, y0: 128, x1: 145, y1: 148 }, text: 'LINE', confidence: 95 },
                    { bbox: { x0: 155, y0: 128, x1: 200, y1: 148 }, text: 'TWO', confidence: 95 },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].text).toBe('LINE ONE\nLINE TWO');
      // y spans 100..148, so x: 98, y: 98, w: 104, h: 52
      expect(regions[0].bbox).toEqual({ x: 98, y: 98, width: 104, height: 52 });
    });

    it('4. Small wild text: preserves small floating text over canvas', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 300, y0: 500, x1: 330, y1: 512 },
                  words: [{ bbox: { x0: 300, y0: 500, x1: 330, y1: 512 }, text: 'gasp', confidence: 80 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].text).toBe('gasp');
      expect(regions[0].bbox).toEqual({ x: 298, y: 498, width: 34, height: 16 });
    });

    it('5. SFX: handles large impact sound effects with correct classification', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 50, y0: 150, x1: 250, y1: 220 },
                  words: [{ bbox: { x0: 50, y0: 150, x1: 250, y1: 220 }, text: 'BOOM!!', confidence: 90 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].category).toBe('sfx');
      expect(regions[0].bbox).toEqual({ x: 48, y: 148, width: 204, height: 74 });
    });

    it('6. Two nearby but unrelated text regions: keeps them separate', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 50, y0: 50, x1: 120, y1: 70 },
                  words: [{ bbox: { x0: 50, y0: 50, x1: 120, y1: 70 }, text: 'SPEAKER 1', confidence: 95 }],
                },
              ],
            },
          ],
        },
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 300, y0: 50, x1: 370, y1: 70 },
                  words: [{ bbox: { x0: 300, y0: 50, x1: 370, y1: 70 }, text: 'SPEAKER 2', confidence: 95 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(2);
      expect(regions[0].text).toBe('SPEAKER 1');
      expect(regions[1].text).toBe('SPEAKER 2');
    });

    it('7. Text near line art: bounds text tightly without capturing artwork area', () => {
      const mockBlocks = [
        {
          bbox: { x0: 400, y0: 100, x1: 800, y1: 600 }, // Entire artwork panel
          paragraphs: [
            {
              bbox: { x0: 410, y0: 110, x1: 790, y1: 590 },
              lines: [
                {
                  bbox: { x0: 420, y0: 150, x1: 500, y1: 170 },
                  words: [{ bbox: { x0: 420, y0: 150, x1: 500, y1: 170 }, text: 'whisper', confidence: 92 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].bbox).toEqual({ x: 418, y: 148, width: 84, height: 24 });
    });

    it('8. Text near faces/hair: keeps box minimal and tight around character pixels', () => {
      const mockBlocks = [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 250, y0: 300, x1: 310, y1: 320 },
                  words: [{ bbox: { x0: 250, y0: 300, x1: 310, y1: 320 }, text: 'gasp...', confidence: 88 }],
                },
              ],
            },
          ],
        },
      ];

      const units = extractTextUnitsFromBlocks(mockBlocks);
      const regions = clusterBoxes(units);

      expect(regions.length).toBe(1);
      expect(regions[0].bbox).toEqual({ x: 248, y: 298, width: 64, height: 24 });
    });
  });
});
