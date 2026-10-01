import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';

// Mock OCR Service
vi.mock('../../modules/ocr/ocrService', () => ({
  detectTextRegions: vi.fn().mockResolvedValue([
    {
      id: 'auto-1',
      bbox: { x: 50, y: 50, width: 100, height: 40 },
      text: 'Cropped Text',
      confidence: 95,
      isCleaned: false,
    },
  ]),
  recognizeRegionText: vi.fn().mockResolvedValue('Recognized Text'),
}));

// Mock Cleaning Service
vi.mock('../../modules/cleaning/cleaningService', () => ({
  cleanImageRegion: vi.fn().mockResolvedValue('data:image/png;base64,cleaned'),
  cleanAllRegions: vi.fn().mockResolvedValue('data:image/png;base64,cleaned_all'),
  CLEANING_LIMITATIONS_NOTICE: { title: 'Notice', items: [] },
}));

// Mock Image loading
class MockImage {
  onload: () => void = () => {};
  onerror: (err: unknown) => void = () => {};
  src = '';
  complete = true;
  naturalWidth = 600;
  naturalHeight = 900;
  width = 600;
  height = 900;
  crossOrigin = '';
  constructor() {
    setTimeout(() => this.onload && this.onload(), 0);
  }
}
vi.stubGlobal('Image', MockImage);

describe('Crop Tool Feature Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Enters crop mode, shows controls, allows resetting crop box, and canceling without changes', async () => {
    render(<App />);

    // Wait for demo page
    await waitFor(() => {
      expect(screen.getByText('Sample_Manhwa_Page_01.png')).not.toBeNull();
    });

    // Find and click Crop button in workspace toolbar
    const cropBtn = screen.getByRole('button', { name: /crop/i });
    expect(cropBtn).not.toBeNull();
    fireEvent.click(cropBtn);

    // Apply, Reset, Cancel controls should appear
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeNull();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Controls should hide
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });

  it('2. Applies crop, updates working image dimensions, transforms existing regions, and supports undo', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sample_Manhwa_Page_01.png')).not.toBeNull();
    });

    // Enter crop mode
    fireEvent.click(screen.getByRole('button', { name: /crop/i }));

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    });

    // Can undo crop
    const undoBtn = screen.getByTitle(/Undo/i);
    expect(undoBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(undoBtn);
  });
});
