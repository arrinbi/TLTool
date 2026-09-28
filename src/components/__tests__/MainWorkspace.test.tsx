import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MainWorkspace } from '../MainWorkspace';
import type { ManhwaPage } from '../../types';

describe('MainWorkspace tall-image zoom and scrolling behavior', () => {
  const tallPage: ManhwaPage = {
    id: 'page-tall-1',
    name: 'Tall_Manhwa_720x16000.png',
    file: new File([''], 'Tall_Manhwa_720x16000.png', { type: 'image/png' }),
    originalUrl: 'blob:http://localhost/original',
    cleanedUrl: 'blob:http://localhost/cleaned',
    width: 720,
    height: 16000,
    regions: [
      {
        id: 'r1',
        bbox: { x: 50, y: 100, width: 200, height: 100 },
        text: 'Top Text',
        confidence: 99,
        isCleaned: false,
      },
      {
        id: 'r2',
        bbox: { x: 50, y: 15500, width: 200, height: 100 },
        text: 'Bottom Text',
        confidence: 99,
        isCleaned: false,
      },
    ],
    history: [],
    historyIndex: -1,
    isProcessing: false,
  };

  it('renders tall image at 100% zoom without vertical viewport clipping constraints', () => {
    const { container } = render(
      <MainWorkspace
        page={tallPage}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        isDrawingMode={false}
        setIsDrawingMode={vi.fn()}
        onRunOcr={vi.fn()}
      />
    );

    const imgEl = container.querySelector('img') as HTMLImageElement;
    expect(imgEl).not.toBeNull();
    expect(imgEl.className).not.toContain('max-h-');
    expect(imgEl.style.width).toBe('720px');
    expect(imgEl.style.height).toBe('16000px');
  });

  it('correctly expands dimensions when zooming in to 200% and 300%', () => {
    render(
      <MainWorkspace
        page={tallPage}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        isDrawingMode={false}
        setIsDrawingMode={vi.fn()}
        onRunOcr={vi.fn()}
      />
    );

    const zoomInBtn = screen.getByTitle('Zoom In');
    const zoomLevelLabel = screen.getByText('100%');
    expect(zoomLevelLabel).not.toBeNull();

    // Zoom to 200% (4 clicks from 100% at +25% each)
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);

    expect(screen.getByText('200%')).not.toBeNull();
    let imgEl = document.querySelector('img') as HTMLImageElement;
    expect(imgEl.style.width).toBe('1440px'); // 720 * 2
    expect(imgEl.style.height).toBe('32000px'); // 16000 * 2

    // Zoom to 300% (4 more clicks)
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);

    expect(screen.getByText('300%')).not.toBeNull();
    imgEl = document.querySelector('img') as HTMLImageElement;
    expect(imgEl.style.width).toBe('2160px'); // 720 * 3
    expect(imgEl.style.height).toBe('48000px'); // 16000 * 3
  });

  it('resets zoom back to 100% cleanly', () => {
    render(
      <MainWorkspace
        page={tallPage}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        isDrawingMode={false}
        setIsDrawingMode={vi.fn()}
        onRunOcr={vi.fn()}
      />
    );

    const zoomInBtn = screen.getByTitle('Zoom In');
    const resetZoomBtn = screen.getByTitle('Reset Zoom');

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('150%')).not.toBeNull();

    fireEvent.click(resetZoomBtn);
    expect(screen.getByText('100%')).not.toBeNull();

    const imgEl = document.querySelector('img') as HTMLImageElement;
    expect(imgEl.style.width).toBe('720px');
    expect(imgEl.style.height).toBe('16000px');
  });
});
