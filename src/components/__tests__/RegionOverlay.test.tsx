import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RegionOverlay } from '../RegionOverlay';

describe('RegionOverlay manual selection coordinate mapping', () => {
  it('correctly maps pointer coordinates to source image coordinates at normal scale', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={3000}
        displayWidth={500}
        displayHeight={1500}
        regions={[]}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={onAddRegion}
        onDeleteRegion={vi.fn()}
        isDrawingMode={true}
        manualCategory="bubble-oval"
      />
    );

    const overlayEl = container.firstChild as HTMLDivElement;

    // Mock getBoundingClientRect
    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 500,
      height: 1500,
      right: 600,
      bottom: 1700,
      x: 100,
      y: 200,
      toJSON: () => {},
    });

    // Pointer down at clientX: 200 (100px into 500px width = 20%), clientY: 500 (300px into 1500px height = 20%)
    fireEvent.pointerDown(overlayEl, {
      clientX: 200,
      clientY: 500,
      pointerId: 1,
    });

    // Pointer move to clientX: 350 (250px into 500px width = 50%), clientY: 1100 (900px into 1500px height = 60%)
    fireEvent.pointerMove(overlayEl, {
      clientX: 350,
      clientY: 1100,
      pointerId: 1,
    });

    // Pointer up at clientX: 350, clientY: 1100
    fireEvent.pointerUp(overlayEl, {
      clientX: 350,
      clientY: 1100,
      pointerId: 1,
    });

    expect(onAddRegion).toHaveBeenCalledTimes(1);
    expect(onAddRegion).toHaveBeenCalledWith(
      {
        x: 200, // 20% of 1000
        y: 600, // 20% of 3000
        width: 300, // (50% - 20%) of 1000 = 300
        height: 1200, // (60% - 20%) of 3000 = 1200
      },
      'bubble-oval'
    );
  });

  it('correctly handles scaled/zoomed containers without coordinate offset', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={3000}
        displayWidth={500}
        displayHeight={1500}
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

    // Mock getBoundingClientRect for 1.5x CSS scale
    // width = 500 * 1.5 = 750, height = 1500 * 1.5 = 2250
    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 50,
      top: 100,
      width: 750,
      height: 2250,
      right: 800,
      bottom: 2350,
      x: 50,
      y: 100,
      toJSON: () => {},
    });

    // Touch down at clientX: 200 (150px into 750px width = 20%), clientY: 550 (450px into 2250px height = 20%)
    fireEvent.pointerDown(overlayEl, {
      clientX: 200,
      clientY: 550,
      pointerId: 1,
    });

    // Touch up at clientX: 425 (375px into 750px width = 50%), clientY: 1450 (1350px into 2250px height = 60%)
    fireEvent.pointerUp(overlayEl, {
      clientX: 425,
      clientY: 1450,
      pointerId: 1,
    });

    expect(onAddRegion).toHaveBeenCalledTimes(1);
    expect(onAddRegion).toHaveBeenCalledWith(
      {
        x: 200,
        y: 600,
        width: 300,
        height: 1200,
      },
      undefined
    );
  });

  it('correctly accounts for viewport scroll offset on tall manhwa images', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={3000}
        displayWidth={500}
        displayHeight={1500}
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

    // Viewport scrolled down so rect.top is -400
    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: -400,
      width: 500,
      height: 1500,
      right: 600,
      bottom: 1100,
      x: 100,
      y: -400,
      toJSON: () => {},
    });

    // Touch down at clientY: 200 (200 - (-400) = 600px into 1500px = 40%)
    fireEvent.pointerDown(overlayEl, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
    });

    // Touch up at clientY: 500 (500 - (-400) = 900px into 1500px = 60%)
    fireEvent.pointerUp(overlayEl, {
      clientX: 300,
      clientY: 500,
      pointerId: 1,
    });

    expect(onAddRegion).toHaveBeenCalledTimes(1);
    expect(onAddRegion).toHaveBeenCalledWith(
      {
        x: 200, // (200 - 100)/500 = 20% -> 200
        y: 1200, // 40% of 3000 -> 1200
        width: 200, // 20% of 1000 -> 200
        height: 600, // (60% - 40%) of 3000 -> 600
      },
      undefined
    );
  });

  it('prevents manual region creation when starting a two-finger touch gesture', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={3000}
        displayWidth={500}
        displayHeight={1500}
        regions={[]}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={onAddRegion}
        onDeleteRegion={vi.fn()}
        isDrawingMode={true}
        manualCategory="bubble-oval"
      />
    );

    const overlayEl = container.firstChild as HTMLDivElement;

    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 1500,
      right: 500,
      bottom: 1500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockTouches = [
      { clientX: 100, clientY: 200 },
      { clientX: 200, clientY: 300 },
    ];

    // Pointer down with two touches present in target / nativeEvent or multiple pointerIds
    fireEvent.pointerDown(overlayEl, {
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      targetTouches: mockTouches,
      touches: mockTouches,
    });
    fireEvent.pointerDown(overlayEl, {
      clientX: 200,
      clientY: 300,
      pointerId: 2,
      targetTouches: mockTouches,
      touches: mockTouches,
    });

    fireEvent.pointerUp(overlayEl, {
      clientX: 300,
      clientY: 600,
      pointerId: 1,
      touches: [],
    });

    expect(onAddRegion).not.toHaveBeenCalled();
  });

  it('cancels active drawing when a second touch pointer is added', () => {
    const onAddRegion = vi.fn();
    const { container } = render(
      <RegionOverlay
        imageWidth={1000}
        imageHeight={3000}
        displayWidth={500}
        displayHeight={1500}
        regions={[]}
        selectedRegionId={null}
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={onAddRegion}
        onDeleteRegion={vi.fn()}
        isDrawingMode={true}
        manualCategory="bubble-oval"
      />
    );

    const overlayEl = container.firstChild as HTMLDivElement;

    vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 1500,
      right: 500,
      bottom: 1500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // 1st finger down
    fireEvent.pointerDown(overlayEl, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      touches: [{ clientX: 100, clientY: 100 }],
    });

    // Move first finger
    fireEvent.pointerMove(overlayEl, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      touches: [{ clientX: 200, clientY: 200 }],
    });

    // 2nd finger down
    fireEvent.pointerDown(overlayEl, {
      clientX: 250,
      clientY: 250,
      pointerId: 2,
      touches: [
        { clientX: 200, clientY: 200 },
        { clientX: 250, clientY: 250 },
      ],
    });

    // Pointer up for finger 1
    fireEvent.pointerUp(overlayEl, {
      clientX: 300,
      clientY: 300,
      pointerId: 1,
      touches: [{ clientX: 250, clientY: 250 }],
    });

    // Pointer up for finger 2
    fireEvent.pointerUp(overlayEl, {
      clientX: 250,
      clientY: 250,
      pointerId: 2,
      touches: [],
    });

    expect(onAddRegion).not.toHaveBeenCalled();
  });
});
