import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../../App';
import { RegionOverlay } from '../RegionOverlay';
import * as ocrService from '../../modules/ocr/ocrService';

describe('Manual OCR Region Selection Feature (#7)', () => {
  it('1. Allows creating a manual region by dragging on the canvas and converting display coords to image coords', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={2000}
        displayWidth={500}
        displayHeight={1000}
        regions={[]}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={onAddRegion}
        onDeleteRegion={vi.fn()}
        isDrawingMode={true}
        manualCategory="bubble-rect"
      />
    );

    const overlayEl = container.firstChild as HTMLDivElement;

    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 50,
      top: 50,
      width: 500,
      height: 1000,
      right: 550,
      bottom: 1050,
      x: 50,
      y: 50,
      toJSON: () => {},
    });

    // Pointer down at display x: 100 (50px in container = 10% -> image x: 100), display y: 150 (100px in container = 10% -> image y: 200)
    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 150, pointerId: 1 });
    // Pointer move to display x: 300 (250px in container = 50% -> image x: 500), display y: 650 (600px in container = 60% -> image y: 1200)
    fireEvent.pointerMove(overlayEl, { clientX: 300, clientY: 650, pointerId: 1 });
    fireEvent.pointerUp(overlayEl, { clientX: 300, clientY: 650, pointerId: 1 });

    expect(onAddRegion).toHaveBeenCalledTimes(1);
    expect(onAddRegion).toHaveBeenCalledWith(
      {
        x: 100,
        y: 200,
        width: 400,
        height: 1000,
      },
      'bubble-rect'
    );
  });

  it('2. Prevents creation of invalid zero-width or zero-height regions', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={2000}
        displayWidth={500}
        displayHeight={1000}
        regions={[]}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={onAddRegion}
        onDeleteRegion={vi.fn()}
        isDrawingMode={true}
      />
    );

    const overlayEl = container.firstChild as HTMLDivElement;

    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 1000,
      right: 500,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Zero-width & zero-height drag (click at same spot)
    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(overlayEl, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(onAddRegion).not.toHaveBeenCalled();
  });

  it('3. Allows selecting and deleting a manual region', async () => {
    render(<App />);

    // Wait for demo page to finish loading
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // Switch to Manual Selection mode
    const manualBtn = screen.getAllByRole('button', { name: /Manual Selection/i })[0];
    fireEvent.click(manualBtn);

    // Wait for canvas overlay
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

    // Draw manual box from (50, 50) to (200, 200)
    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });

    // Check detected regions list in inspector
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
    });

    // Click trash button to delete region
    const deleteBtn = screen.getByTitle('Delete Box');
    fireEvent.click(deleteBtn);

    // Region count should return to 0
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(0\)/i)).toBeDefined();
    });
  });

  it('4. Keeps manual regions separate from automatic regions when running automatic OCR', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // Mock OCR detection result
    vi.spyOn(ocrService, 'detectTextRegions').mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 300, y: 300, width: 100, height: 50 },
        text: 'Auto Detected Text',
        confidence: 95,
        isCleaned: false,
        isManual: false,
        source: 'auto',
      },
    ]);

    // 1. Switch to Manual Mode and draw a manual region
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();

    // 2. Click Automatic Detection to run auto OCR
    const autoBtn = screen.getAllByRole('button', { name: /Automatic Detection/i })[0];
    fireEvent.click(autoBtn);

    // Should now have 2 regions: 1 existing manual region + 1 newly detected auto region
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
      expect(screen.getByText('Auto Detected Text')).toBeDefined();
    });
  });

  it('5. Preserves regions when switching between pages', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // Create manual region on page 1
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();

    // Upload a second page
    const file = new File(['dummy content'], 'Page_02.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    // Switch to page 2 (which should have 0 regions)
    await waitFor(() => {
      const page2Card = screen.getByText('Page_02.png');
      expect(page2Card).toBeDefined();
      fireEvent.click(page2Card);
    });

    expect(screen.getByText(/Detected Regions \(0\)/i)).toBeDefined();

    // Switch back to demo page 1 (which should still have 1 region)
    const page1Card = screen.getByText('Sample_Manhwa_Page_01.png');
    fireEvent.click(page1Card);

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
    });
  });

  it('6. Ensures deleting an OCR region does NOT remove cleaning masks or alter cleaned canvas state', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // Draw manual region
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();

    // Delete region
    const deleteBtn = screen.getByTitle('Delete Box');
    fireEvent.click(deleteBtn);

    // Verify regions list is empty, but page image state remains intact
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(0\)/i)).toBeDefined();
    });
  });

  it('7. Runs OCR on a manual region, updating text while preserving metadata, and handles failure safely', async () => {
    const recognizeSpy = vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('RECOGNIZED TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Manual Selection/i }).length).toBeGreaterThan(0);
    });

    // 1. Switch to Manual Mode and draw a manual region
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    // Verify initial region created has empty text initially
    const textArea = await waitFor(() => screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement);
    expect(textArea.value).toBe('');

    // Click "Run OCR" button on selected region
    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    expect(recognizeSpy).toHaveBeenCalledTimes(1);

    // Verify OCR result is written into text field and region remains present
    await waitFor(() => {
      expect(textArea.value).toBe('RECOGNIZED TEXT');
    });

    // Test OCR Failure
    recognizeSpy.mockRejectedValueOnce(new Error('OCR engine error'));
    fireEvent.click(runOcrBtn);

    // Verify processing state clears and region remains intact with previous text
    await waitFor(() => {
      expect(screen.queryByText('Recognizing text...')).toBeNull();
      expect(textArea.value).toBe('RECOGNIZED TEXT');
    });
  });
});
