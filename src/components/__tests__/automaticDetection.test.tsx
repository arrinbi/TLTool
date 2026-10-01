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
    recognizeRegionText: vi.fn(),
  };
});

describe('Automatic Detection Execution Flow with Automatic OCR', () => {
  const mockRegions: TextRegion[] = [
    {
      id: 'auto-1',
      bbox: { x: 100, y: 150, width: 200, height: 80 },
      text: '',
      confidence: 95,
      isCleaned: false,
      category: 'bubble-oval',
    },
    {
      id: 'auto-2',
      bbox: { x: 300, y: 500, width: 180, height: 60 },
      text: '',
      confidence: 90,
      isCleaned: false,
      category: 'bubble-rect',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. does NOT run Automatic Detection on upload, but runs when user explicitly clicks Automatic Detection', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue(mockRegions);
    recognizeSpy.mockResolvedValue('RECOGNIZED OCR TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    expect(detectSpy).not.toHaveBeenCalled();
    expect(recognizeSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Detected Regions \(0\)/i)).toBeDefined();

    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    expect(detectSpy).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
    });

    expect(recognizeSpy).toHaveBeenCalledTimes(2);
  });

  it('2. automatically triggers recognizeRegionText for each detected region and updates region text', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue(mockRegions);
    recognizeSpy
      .mockResolvedValueOnce('Hello World')
      .mockResolvedValueOnce('What is this?');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    await waitFor(
      () => {
        expect(screen.getByText(/Hello World/i)).toBeDefined();
        expect(screen.getByText(/What is this\?/i)).toBeDefined();
      },
      { timeout: 4000 }
    );

    expect(recognizeSpy).toHaveBeenCalledTimes(2);
    expect(recognizeSpy.mock.calls[0][1]).toEqual(mockRegions[0].bbox);
    expect(recognizeSpy.mock.calls[1][1]).toEqual(mockRegions[1].bbox);
  });

  it('3. preserves existing manual regions and does NOT send manual regions through automatic OCR', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue([
      {
        id: 'auto-new-1',
        bbox: { x: 300, y: 300, width: 100, height: 50 },
        text: '',
        confidence: 90,
        isCleaned: false,
        source: 'auto',
      },
    ]);
    recognizeSpy.mockResolvedValue('Auto Text Output');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // Switch to manual selection
    const manualBtn = screen.getAllByRole('button', { name: /Manual Selection/i })[0];
    fireEvent.click(manualBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair');
      expect(el).not.toBeNull();
      return el!;
    });

    vi.spyOn(canvasOverlay, 'getBoundingClientRect').mockReturnValue({
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

    // Draw manual box
    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();

    // Click Automatic Detection
    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    // Should now have 2 regions: 1 manual + 1 auto
    await waitFor(
      () => {
        expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
        expect(screen.getByText(/Auto Text Output/i)).toBeDefined();
      },
      { timeout: 4000 }
    );

    // Verify recognizeRegionText was called ONLY ONCE for the auto region, NOT for the manual region
    expect(recognizeSpy).toHaveBeenCalledTimes(1);
    expect(recognizeSpy.mock.calls[0][1]).toEqual({ x: 300, y: 300, width: 100, height: 50 });
  });

  it('4. handles partial OCR failure gracefully, keeping all regions and continuing remaining OCR jobs', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 50, y: 50, width: 100, height: 40 },
        text: 'Initial Text 1',
        confidence: 90,
        isCleaned: false,
      },
      {
        id: 'auto-2',
        bbox: { x: 200, y: 200, width: 120, height: 50 },
        text: 'Initial Text 2',
        confidence: 85,
        isCleaned: false,
      },
    ]);

    // First region OCR fails, second succeeds
    recognizeSpy
      .mockRejectedValueOnce(new Error('Tesseract timeout error'))
      .mockResolvedValueOnce('Success Text 2');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
      expect(screen.getByText('Success Text 2')).toBeDefined();
    });

    // Both regions should still exist in state
    expect(recognizeSpy).toHaveBeenCalledTimes(2);
  });

  it('5. skips invalid zero-width or zero-height regions safely during automatic detection', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue([
      {
        id: 'invalid-1',
        bbox: { x: 0, y: 0, width: 0, height: 50 },
        text: '',
        confidence: 50,
        isCleaned: false,
      },
      {
        id: 'valid-1',
        bbox: { x: 100, y: 100, width: 80, height: 40 },
        text: '',
        confidence: 90,
        isCleaned: false,
      },
    ]);

    recognizeSpy.mockResolvedValue('Valid OCR Text');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
      expect(screen.getByText('Valid OCR Text')).toBeDefined();
    });

    // recognizeRegionText should only be called once for valid-1
    expect(recognizeSpy).toHaveBeenCalledTimes(1);
  });

  it('6. clears processing state and resets isProcessing to false when detection and OCR finish', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 10, y: 10, width: 100, height: 30 },
        text: '',
        confidence: 80,
        isCleaned: false,
      },
    ]);
    recognizeSpy.mockResolvedValue('Finishing Test');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    await waitFor(() => {
      expect(screen.getByText('Finishing Test')).toBeDefined();
    });

    // Ensure processing indicator is gone
    expect(screen.queryByText(/Recognizing text/i)).toBeNull();
    expect(screen.queryByText(/Detecting text/i)).toBeNull();
  });

  it('7. allows manual Run OCR button on individual selected region after automatic OCR completes', async () => {
    const detectSpy = vi.mocked(ocrService.detectTextRegions);
    const recognizeSpy = vi.mocked(ocrService.recognizeRegionText);

    detectSpy.mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 20, y: 20, width: 100, height: 40 },
        text: 'Initial Auto Text',
        confidence: 85,
        isCleaned: false,
      },
    ]);

    recognizeSpy
      .mockResolvedValueOnce('Initial Auto Text') // for automatic OCR
      .mockResolvedValueOnce('Manual Re-Run Text'); // for manual button click

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Run automatic detection
    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    await waitFor(() => {
      expect(screen.getByText('Initial Auto Text')).toBeDefined();
    });

    // Select the region in list
    const regionItem = screen.getByText('Initial Auto Text');
    fireEvent.click(regionItem);

    // Click manual Run OCR button
    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    await waitFor(
      () => {
        expect(screen.getAllByText(/Manual Re-Run Text/i).length).toBeGreaterThan(0);
      },
      { timeout: 4000 }
    );

    expect(recognizeSpy).toHaveBeenCalledTimes(2);
  });
});
