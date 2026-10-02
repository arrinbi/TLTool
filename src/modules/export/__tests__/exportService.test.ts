import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ManhwaPage } from '../../../types';
import { exportPagesAsPdf, exportPagesAsZip } from '../exportService';

// Mock renderTypesetImage
vi.mock('../../typesetting/typesettingService', () => ({
  renderTypesetImage: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
}));

// Mock jsPDF
const mockSave = vi.fn();
const mockAddPage = vi.fn();
const mockAddImage = vi.fn();

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(function (this: any) {
      this.save = mockSave;
      this.addPage = mockAddPage;
      this.addImage = mockAddImage;
      return this;
    }),
  };
});

describe('Export Utility Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const samplePages: ManhwaPage[] = [
    {
      id: 'page-1',
      name: 'page_01.png',
      file: new File([], 'page_01.png', { type: 'image/png' }),
      originalUrl: 'data:image/png;base64,sample1',
      cleanedUrl: 'data:image/png;base64,sample1',
      width: 600,
      height: 800,
      history: [],
      historyIndex: -1,
      isProcessing: false,
      regions: [
        {
          id: 'r1',
          bbox: { x: 50, y: 50, width: 200, height: 100 },
          text: 'Original',
          translatedText: 'Translated Text 1',
          confidence: 95,
          isCleaned: true,
        },
      ],
    },
    {
      id: 'page-2',
      name: 'page_02.png',
      file: new File([], 'page_02.png', { type: 'image/png' }),
      originalUrl: 'data:image/png;base64,sample2',
      cleanedUrl: 'data:image/png;base64,sample2',
      width: 600,
      height: 800,
      history: [],
      historyIndex: -1,
      isProcessing: false,
      regions: [
        {
          id: 'r2',
          bbox: { x: 50, y: 50, width: 200, height: 100 },
          text: 'Original 2',
          translatedText: 'Translated Text 2',
          confidence: 95,
          isCleaned: true,
        },
      ],
    },
  ];

  it('exportPagesAsPdf generates multi-page PDF using rendered typeset images', async () => {
    const progressFn = vi.fn();
    await exportPagesAsPdf(samplePages, 'sans-serif', progressFn);

    expect(progressFn).toHaveBeenCalledTimes(2);
    expect(mockAddPage).toHaveBeenCalledTimes(1);
    expect(mockAddImage).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenCalledWith('manhwa_translated_export.pdf');
  });

  it('exportPagesAsZip packs rendered pages into a ZIP archive for download', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const progressFn = vi.fn();

    await exportPagesAsZip(samplePages, 'sans-serif', progressFn);

    expect(progressFn).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });

  it('throws error when page list is empty', async () => {
    await expect(exportPagesAsPdf([])).rejects.toThrow('No pages available to export.');
    await expect(exportPagesAsZip([])).rejects.toThrow('No pages available to export.');
  });
});
