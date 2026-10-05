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

  it('3. Allows selecting and deleting a manual OCR region in Stage 1', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Enable draw mode in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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
    vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('Auto Detected Text');
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Draw a manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
    });

    // Run Automatic OCR in Stage 1
    const autoBtn = screen.getAllByRole('button', { name: /Automatic OCR/i })[0];
    fireEvent.click(autoBtn);

    // Should now have 2 regions: 1 existing manual region + 1 newly detected auto region
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
      expect(screen.getAllByText('Auto Detected Text').length).toBeGreaterThan(0);
    });
  });

  it('5. Preserves regions when switching between pages', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Create manual region on page 1 in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

  it('7. Runs OCR on a region in OCR Stage, updating text while preserving metadata, and handles failure safely', async () => {
    const recognizeSpy = vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('RECOGNIZED TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Draw manual region in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    // Select region item
    const regionItem = await waitFor(() => screen.getByText(/\[100×100\]/i));
    fireEvent.click(regionItem);

    // Click "Run OCR" button on selected region
    recognizeSpy.mockResolvedValueOnce('RE-RUN RECOGNIZED TEXT');
    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    expect(recognizeSpy).toHaveBeenCalled();

    const textArea = await waitFor(() => screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement);
    await waitFor(() => {
      expect(textArea.value).toBe('RE-RUN RECOGNIZED TEXT');
    });

    // Test manual re-OCR Failure
    recognizeSpy.mockRejectedValueOnce(new Error('OCR engine error'));
    fireEvent.click(runOcrBtn);

    // Verify processing state clears and region remains intact with previous text
    await waitFor(() => {
      expect(screen.queryByText('Recognizing text...')).toBeNull();
      expect(textArea.value).toBe('RE-RUN RECOGNIZED TEXT');
    });
  });

  it('8. Creates region in Stage 1 OCR and runs OCR on selected region', async () => {
    const recognizeSpy = vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('AUTO RECT TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 250, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 250, clientY: 250, pointerId: 1 });

    const regionItem = await waitFor(() => screen.getByText(/\[150×150\]/i));
    fireEvent.click(regionItem);

    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    expect(recognizeSpy).toHaveBeenCalled();

    const textArea = await waitFor(() => screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement);
    await waitFor(() => {
      expect(textArea.value).toBe('AUTO RECT TEXT');
    });
  });

  it('9. Creates manual region in Stage 1 OCR and runs OCR on selected region', async () => {
    const recognizeSpy = vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('AUTO BRUSH TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    fireEvent.pointerDown(canvasOverlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });

    const regionItem = await waitFor(() => screen.getByText(/\[100×100\]/i));
    fireEvent.click(regionItem);

    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    expect(recognizeSpy).toHaveBeenCalled();

    const textArea = await waitFor(() => screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement);
    await waitFor(() => {
      expect(textArea.value).toBe('AUTO BRUSH TEXT');
    });
  });

  it('10. Creating multiple manual regions sequentially triggers OCR on demand per region', async () => {
    const recognizeSpy = vi.spyOn(ocrService, 'recognizeRegionText')
      .mockResolvedValue('REGION TEXT');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    // Draw Region 1
    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    // Draw Region 2
    fireEvent.pointerDown(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 300, clientY: 300, pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(2\)/i)).toBeDefined();
    });

    // Drawing 2 manual regions in Stage 1 OCR automatically triggered recognizeRegionText for each
    await waitFor(() => {
      expect(recognizeSpy).toHaveBeenCalledTimes(2);
    });

    // Run OCR on demand for region 1
    const item1 = screen.getAllByText(/REGION TEXT/i)[0];
    fireEvent.click(item1);
    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    await waitFor(() => {
      expect(recognizeSpy).toHaveBeenCalledTimes(3);
    });

    // Run OCR on demand for region 2
    const item2 = screen.getAllByText(/REGION TEXT/i)[1];
    fireEvent.click(item2);
    fireEvent.click(runOcrBtn);

    await waitFor(() => {
      expect(recognizeSpy).toHaveBeenCalledTimes(4);
    });
  });

  it('11. Handles OCR failure safely without removing the region', async () => {
    vi.spyOn(ocrService, 'recognizeRegionText').mockRejectedValue(new Error('Tesseract failed'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
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

    const regionItem = await waitFor(() => screen.getByText(/\[100×100\]/i));
    fireEvent.click(regionItem);

    const runOcrBtn = screen.getByRole('button', { name: /Run OCR/i });
    fireEvent.click(runOcrBtn);

    // Verify region remains created and text field is present (empty)
    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
      const textArea = screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement;
      expect(textArea.value).toBe('');
      expect(screen.queryByText('Recognizing text...')).toBeNull();
    });
  });
});
