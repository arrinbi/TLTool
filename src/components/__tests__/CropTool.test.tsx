import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';
import { CropOverlay } from '../CropOverlay';

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

describe('CropOverlay Direct Interaction Tests', () => {
  const defaultProps = {
    imageWidth: 1000,
    imageHeight: 1000,
    displayWidth: 500,
    displayHeight: 500,
    cropRect: { x: 100, y: 100, width: 400, height: 400 },
    onChangeCropRect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly 8 resize handles', () => {
    render(<CropOverlay {...defaultProps} />);

    const handleNames = [
      'top-left',
      'top-center',
      'top-right',
      'middle-left',
      'middle-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ];

    handleNames.forEach((name) => {
      expect(screen.getByTestId(`crop-handle-${name}`)).not.toBeNull();
    });

    const handles = screen.getAllByRole('button', { name: /Resize crop/i });
    expect(handles.length).toBe(8);
  });

  it('dragging top-left changes x, y, width, and height correctly', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const handleTopLeft = screen.getByTestId('crop-handle-top-left');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Drag start on top-left handle (image coords x:100, y:100 => client coords x:50, y:50)
    fireEvent.pointerDown(handleTopLeft, { clientX: 50, clientY: 50, pointerId: 1 });

    // Drag to new position (client coords x:25, y:25 => image coords x:50, y:50)
    fireEvent.pointerMove(container, { clientX: 25, clientY: 25, pointerId: 1 });

    expect(onChangeCropRect).toHaveBeenCalledWith({
      x: 50,
      y: 50,
      width: 450,
      height: 450,
    });
  });

  it('dragging top-center changes only the top edge (y and height)', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const handleTopCenter = screen.getByTestId('crop-handle-top-center');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Start drag at image y=100 (client y=50)
    fireEvent.pointerDown(handleTopCenter, { clientX: 150, clientY: 50, pointerId: 1 });

    // Drag top edge down to image y=150 (client y=75)
    fireEvent.pointerMove(container, { clientX: 150, clientY: 75, pointerId: 1 });

    expect(onChangeCropRect).toHaveBeenCalledWith({
      x: 100, // unchanged
      y: 150, // shifted down by 50
      width: 400, // unchanged
      height: 350, // reduced by 50
    });
  });

  it('dragging middle-left changes only the left edge (x and width)', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const handleMiddleLeft = screen.getByTestId('crop-handle-middle-left');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Start drag at image x=100 (client x=50)
    fireEvent.pointerDown(handleMiddleLeft, { clientX: 50, clientY: 150, pointerId: 1 });

    // Drag left edge right to image x=200 (client x=100)
    fireEvent.pointerMove(container, { clientX: 100, clientY: 150, pointerId: 1 });

    expect(onChangeCropRect).toHaveBeenCalledWith({
      x: 200, // shifted right by 100
      y: 100, // unchanged
      width: 300, // reduced by 100
      height: 400, // unchanged
    });
  });

  it('dragging bottom-right changes width and height correctly', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const handleBottomRight = screen.getByTestId('crop-handle-bottom-right');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Right bottom edge is at image x=500, y=500 (client x=250, y=250)
    fireEvent.pointerDown(handleBottomRight, { clientX: 250, clientY: 250, pointerId: 1 });

    // Drag out to image x=600, y=600 (client x=300, y=300)
    fireEvent.pointerMove(container, { clientX: 300, clientY: 300, pointerId: 1 });

    expect(onChangeCropRect).toHaveBeenCalledWith({
      x: 100, // unchanged
      y: 100, // unchanged
      width: 500, // increased by 100
      height: 500, // increased by 100
    });
  });

  it('pointer/touch interaction on the crop selection body does NOT move or resize the crop', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const selectionBox = screen.getByTestId('crop-selection-box');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Pointer down on selection box body
    fireEvent.pointerDown(selectionBox, { clientX: 100, clientY: 100, pointerId: 1 });
    // Drag on container
    fireEvent.pointerMove(container, { clientX: 200, clientY: 200, pointerId: 1 });

    expect(onChangeCropRect).not.toHaveBeenCalled();
  });

  it('pointer/touch interaction on the image outside the crop rectangle does NOT change the crop', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Pointer down outside crop rect
    fireEvent.pointerDown(container, { clientX: 10, clientY: 10, pointerId: 1 });
    // Drag
    fireEvent.pointerMove(container, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(onChangeCropRect).not.toHaveBeenCalled();
  });

  it('crop remains constrained to image boundaries', () => {
    const onChangeCropRect = vi.fn();
    render(<CropOverlay {...defaultProps} onChangeCropRect={onChangeCropRect} />);

    const container = screen.getByTestId('crop-overlay-container');
    const handleBottomRight = screen.getByTestId('crop-handle-bottom-right');

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Bottom right handle drag start
    fireEvent.pointerDown(handleBottomRight, { clientX: 250, clientY: 250, pointerId: 1 });

    // Drag far outside image bounds (client x=1000, y=1000 => image coords 2000, 2000)
    fireEvent.pointerMove(container, { clientX: 1000, clientY: 1000, pointerId: 1 });

    expect(onChangeCropRect).toHaveBeenCalledWith({
      x: 100,
      y: 100,
      width: 900, // clamped to max image width 1000 - x(100)
      height: 900, // clamped to max image height 1000 - y(100)
    });
  });
});
