import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';
import * as ocrService from '../../modules/ocr/ocrService';
import type { TextRegion } from '../../types';

vi.mock('../../modules/ocr/ocrService', async () => {
  const actual = await vi.importActual<typeof import('../../modules/ocr/ocrService')>(
    '../../modules/ocr/ocrService'
  );
  return {
    ...actual,
    detectTextRegions: vi.fn(),
  };
});

describe('Automatic Detection Execution Flow', () => {
  const mockRegions: TextRegion[] = [
    {
      id: 'region-auto-1',
      bbox: { x: 100, y: 150, width: 200, height: 80 },
      text: 'DETECTED TEXT 1',
      confidence: 95,
      isCleaned: false,
      category: 'bubble-oval',
    },
    {
      id: 'region-auto-2',
      bbox: { x: 300, y: 500, width: 180, height: 60 },
      text: 'DETECTED TEXT 2',
      confidence: 90,
      isCleaned: false,
      category: 'bubble-rect',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT run Automatic Detection on upload, but runs when user explicitly clicks Automatic Detection', async () => {
    const detectTextRegionsSpy = vi.mocked(ocrService.detectTextRegions);
    detectTextRegionsSpy.mockResolvedValue(mockRegions);

    render(<App />);

    // Wait for initial demo page to render
    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Verify OCR was NOT called automatically on initial load or upload
    expect(detectTextRegionsSpy).not.toHaveBeenCalled();

    // Verify initial region count is 0
    expect(screen.getByText(/Detected Regions \(0\)/i)).toBeDefined();

    // User clicks "Automatic Detection" button
    const autoDetectionButtons = screen.getAllByRole('button', { name: /Automatic Detection/i });
    expect(autoDetectionButtons.length).toBeGreaterThan(0);

    fireEvent.click(autoDetectionButtons[0]);

    // Verify OCR service is explicitly called
    expect(detectTextRegionsSpy).toHaveBeenCalledTimes(1);

    // Wait for returned regions to be stored and displayed
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
    });

    expect(screen.getByText('DETECTED TEXT 1')).toBeDefined();
    expect(screen.getByText('DETECTED TEXT 2')).toBeDefined();
  });
});
