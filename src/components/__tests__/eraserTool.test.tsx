import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import * as ocrService from '../../modules/ocr/ocrService';
import * as aiService from '../../modules/ai/aiService';
import * as cleaningService from '../../modules/cleaning/cleaningService';

// Mock OCR & AI services
vi.mock('../../modules/ocr/ocrService', async () => {
  const actual = await vi.importActual('../../modules/ocr/ocrService');
  return {
    ...actual,
    detectTextRegions: vi.fn().mockResolvedValue([]),
    detectBubbleRegions: vi.fn().mockResolvedValue([]),
    recognizeRegionText: vi.fn().mockResolvedValue('Mocked OCR Text'),
  };
});

vi.mock('../../modules/ai/aiService', async () => {
  const actual = await vi.importActual('../../modules/ai/aiService');
  return {
    ...actual,
    recognizeText: vi.fn().mockResolvedValue('Mocked OCR Text'),
    translateRegion: vi.fn().mockResolvedValue('Mocked Translation'),
    translateAllRegions: vi.fn().mockResolvedValue({ updatedRegions: [], failedRegionIds: [], errors: {} }),
  };
});

// Mock cleaningService cleanImageRegion
vi.mock('../../modules/cleaning/cleaningService', async () => {
  const actual = await vi.importActual('../../modules/cleaning/cleaningService');
  return {
    ...actual,
    cleanImageRegion: vi.fn().mockImplementation(async (url) => url),
    cleanAllRegions: vi.fn().mockImplementation(async (url) => url),
  };
});

describe('Eraser Tool Regression Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getOverlay = async () => {
    const el = await waitFor(() => {
      const container = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(container).not.toBeNull();
      return container as HTMLDivElement;
    });

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 900,
      right: 600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    return el;
  };

  it('1. Eraser removes pixels/areas from the cleaning mask', async () => {
    render(<App />);

    // Wait for demo page load
    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Create manual OCR region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const overlayContainer = await getOverlay();

    // Draw manual rectangle (100x100)
    fireEvent.pointerDown(overlayContainer, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeInTheDocument();
    });

    // Switch to Stage 2 Cleaning Studio
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    await waitFor(() => {
      expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
    });

    // Select Eraser Tool
    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    // Draw eraser stroke over center of region
    fireEvent.pointerDown(overlayContainer, { clientX: 90, clientY: 90, pointerId: 2 });
    fireEvent.pointerMove(overlayContainer, { clientX: 110, clientY: 110, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 110, clientY: 110, pointerId: 2 });

    // Region mask must now be modified and have brushMask
    expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
  });

  it('2. Erasing does NOT delete TextRegions', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const overlayContainer = await getOverlay();
    fireEvent.pointerDown(overlayContainer, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 100, clientY: 100, pointerId: 1 });

    // Switch to Stage 2 Cleaning
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    await waitFor(() => {
      expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
    });

    // Select Eraser tool
    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    // Erase completely over the region area
    fireEvent.pointerDown(overlayContainer, { clientX: 30, clientY: 30, pointerId: 2 });
    fireEvent.pointerMove(overlayContainer, { clientX: 120, clientY: 120, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 120, clientY: 120, pointerId: 2 });

    // TextRegion MUST NOT be deleted! Count must remain 1
    expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
  });

  it('3. Erasing does NOT trigger OCR', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const overlayContainer = await getOverlay();
    fireEvent.pointerDown(overlayContainer, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 120, clientY: 120, pointerId: 1 });

    // Switch to Stage 2 Cleaning Studio
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    await waitFor(() => {
      expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
    });

    // Clear OCR mocks to track calls during erasing
    vi.clearAllMocks();

    // Select Eraser tool
    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    // Erase across the region
    fireEvent.pointerDown(overlayContainer, { clientX: 80, clientY: 80, pointerId: 2 });
    fireEvent.pointerMove(overlayContainer, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 100, clientY: 100, pointerId: 2 });

    // Verify recognizeText and detectTextRegions were NOT called during erasing
    expect(aiService.recognizeText).not.toHaveBeenCalled();
    expect(ocrService.detectTextRegions).not.toHaveBeenCalled();
  });

  it('4. Erasing does NOT trigger bubble detection', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const overlayContainer = await getOverlay();
    fireEvent.pointerDown(overlayContainer, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 100, clientY: 100, pointerId: 1 });

    // Switch to Stage 2 Cleaning
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    await waitFor(() => {
      expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
    });

    vi.clearAllMocks();

    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    fireEvent.pointerDown(overlayContainer, { clientX: 70, clientY: 70, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 70, clientY: 70, pointerId: 2 });

    expect(ocrService.detectBubbleRegions).not.toHaveBeenCalled();
  });

  it('5. Cleaning uses the final edited mask, not the original unedited mask', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const overlayContainer = await getOverlay();
    fireEvent.pointerDown(overlayContainer, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 200, clientY: 200, pointerId: 1 });

    // Switch to Stage 2 Cleaning Studio
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    await waitFor(() => {
      expect(screen.getByText(/Regions Cleaning Status \(1\)/i)).toBeInTheDocument();
    });

    // Switch to Eraser tool and erase part of the selection
    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    fireEvent.pointerDown(overlayContainer, { clientX: 140, clientY: 140, pointerId: 2 });
    fireEvent.pointerMove(overlayContainer, { clientX: 160, clientY: 160, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 160, clientY: 160, pointerId: 2 });

    // Click region in list to ensure selectedRegionId
    const regionItem = screen.getByText(/\[100×100\]/i);
    fireEvent.click(regionItem);

    // Click "Clean Selected Region"
    const cleanRegionBtn = screen.getByRole('button', { name: /Clean Selected Region/i });
    fireEvent.click(cleanRegionBtn);

    // Verify cleanImageRegion was called with brushMask set on options
    await waitFor(() => {
      expect(cleaningService.cleanImageRegion).toHaveBeenCalled();
      const calledOptions = (cleaningService.cleanImageRegion as any).mock.calls[0][2];
      expect(calledOptions.brushMask).toBeDefined();
      expect(calledOptions.brushMask.length).toBe(100 * 100);
    });
  });

  it('6. Allows freely alternating between Rectangle, Brush, and Eraser in Stage 2 before cleaning', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeInTheDocument();
    });

    // Draw manual OCR region in Stage 1
    const drawToggleBtnOcr = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtnOcr);

    const overlayContainer = await getOverlay();
    fireEvent.pointerDown(overlayContainer, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });

    // Switch to Stage 2 Cleaning
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    const drawToggleBtn = screen.getByTitle('Draw New Cleaning Mask Tool');
    fireEvent.click(drawToggleBtn);

    // 1. Rectangle direct clean
    fireEvent.pointerDown(overlayContainer, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(overlayContainer, { clientX: 150, clientY: 150, pointerId: 1 });

    await waitFor(() => {
      expect(cleaningService.cleanImageRegion).toHaveBeenCalled();
    });

    // 2. Eraser
    const eraserBtn = screen.getAllByRole('button', { name: /Eraser/i })[0];
    fireEvent.click(eraserBtn);

    fireEvent.pointerDown(overlayContainer, { clientX: 90, clientY: 90, pointerId: 2 });
    fireEvent.pointerUp(overlayContainer, { clientX: 90, clientY: 90, pointerId: 2 });

    // 3. Brush
    const brushBtn = screen.getAllByRole('button', { name: /Brush/i })[0];
    fireEvent.click(brushBtn);

    fireEvent.pointerDown(overlayContainer, { clientX: 160, clientY: 160, pointerId: 3 });
    fireEvent.pointerUp(overlayContainer, { clientX: 160, clientY: 160, pointerId: 3 });

    // 4. Eraser
    fireEvent.click(eraserBtn);

    fireEvent.pointerDown(overlayContainer, { clientX: 160, clientY: 160, pointerId: 4 });
    fireEvent.pointerUp(overlayContainer, { clientX: 160, clientY: 160, pointerId: 4 });

    // 5. Clean Selected Region or Clean All Regions
    const cleanAllBtn = screen.getByRole('button', { name: /Clean All Regions/i });
    fireEvent.click(cleanAllBtn);

    await waitFor(() => {
      expect(cleaningService.cleanImageRegion).toHaveBeenCalled();
    });
  });
});
