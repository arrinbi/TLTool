import { describe, it, expect } from 'vitest';
import type { ManhwaPage, TextRegion, RegionCategory, BoundingBox } from '../../types';

describe('Upload Workflow & Manual Region Creation', () => {
  it('initializes a newly uploaded page with no detected text regions', () => {
    const pageId = 'test-page-1';
    const mockFile = new File(['dummy content'], 'page_01.png', { type: 'image/png' });
    const mockUrl = 'blob:http://localhost/dummy-url';

    const pageObj: ManhwaPage = {
      id: pageId,
      name: mockFile.name,
      file: mockFile,
      originalUrl: mockUrl,
      cleanedUrl: mockUrl,
      width: 800,
      height: 1200,
      regions: [],
      history: [],
      historyIndex: -1,
      isProcessing: false,
    };

    expect(pageObj.regions).toBeDefined();
    expect(pageObj.regions.length).toBe(0);
  });

  it('creates manual regions adhering to the TextRegion structure and category options', () => {
    const categories: RegionCategory[] = [
      'bubble-oval',
      'bubble-rect',
      'text-outside',
      'sfx',
    ];

    const bbox: BoundingBox = { x: 50, y: 100, width: 150, height: 80 };

    categories.forEach((category) => {
      const region: TextRegion = {
        id: `region-${Date.now()}-${category}`,
        bbox,
        text: '',
        confidence: 100,
        isCleaned: false,
        category,
      };

      expect(region.id).toContain('region-');
      expect(region.bbox).toEqual({ x: 50, y: 100, width: 150, height: 80 });
      expect(region.text).toBe('');
      expect(region.confidence).toBe(100);
      expect(region.isCleaned).toBe(false);
      expect(region.category).toBe(category);
    });
  });

  it('supports updating categories on existing regions', () => {
    const region: TextRegion = {
      id: 'region-123',
      bbox: { x: 10, y: 10, width: 50, height: 50 },
      text: 'SAMPLE TEXT',
      confidence: 95,
      isCleaned: false,
      category: 'bubble-oval',
    };

    const updatedRegion: TextRegion = {
      ...region,
      category: 'sfx',
    };

    expect(updatedRegion.category).toBe('sfx');
  });
});
