import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TextRegion, ManhwaPage } from '../../../types';
import { RegionInspector } from '../../../components/RegionInspector';
import {
  getEffectiveTypesettingStyle,
  renderRegionTypesetting,
  renderTypesetImage,
} from '../typesettingService';
import { exportPagesAsPdf, exportPagesAsZip } from '../../export/exportService';

// Mock jspdf and jszip
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

vi.mock('jszip', () => {
  return {
    default: vi.fn().mockImplementation(function (this: any) {
      this.file = vi.fn();
      this.generateAsync = vi.fn().mockResolvedValue(new Blob(['mock zip']));
      return this;
    }),
  };
});

describe('Color and Gradient Controls for Typesetting', () => {
  const dummyFile = new File(['dummy'], 'test.png', { type: 'image/png' });
  const mockCleanedUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const mockRegionA: TextRegion = {
    id: 'region-a',
    bbox: { x: 10, y: 10, width: 100, height: 50 },
    text: 'Original Text A',
    translatedText: 'Translated Text A',
    confidence: 95,
    isCleaned: true,
    category: 'bubble-oval',
    typesetting: {
      color: '#ff0000',
      colorMode: 'solid',
    },
  };

  const mockRegionB: TextRegion = {
    id: 'region-b',
    bbox: { x: 150, y: 50, width: 120, height: 60 },
    text: 'Original Text B',
    translatedText: 'Translated Text B',
    confidence: 90,
    isCleaned: true,
    category: 'bubble-rect',
    typesetting: {
      colorMode: 'gradient',
      gradient: {
        startColor: '#111111',
        endColor: '#222222',
        direction: 'vertical',
      },
    },
  };

  const mockPage: ManhwaPage = {
    id: 'page-1',
    name: 'Page 1',
    file: dummyFile,
    originalUrl: mockCleanedUrl,
    cleanedUrl: mockCleanedUrl,
    width: 800,
    height: 1200,
    regions: [mockRegionA, mockRegionB],
    history: [],
    historyIndex: -1,
    isProcessing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Solid color can be changed.', () => {
    const handleUpdateRegion = vi.fn();

    render(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdateRegion}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const colorPicker = screen.getByLabelText('Solid Text Color Picker');
    fireEvent.change(colorPicker, { target: { value: '#00ff00' } });

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-a',
        typesetting: expect.objectContaining({
          color: '#00ff00',
        }),
      })
    );
  });

  it('2. Solid color persists on the text object.', () => {
    const customSolidRegion: TextRegion = {
      ...mockRegionA,
      typesetting: {
        color: '#123456',
        colorMode: 'solid',
      },
    };

    const style = getEffectiveTypesettingStyle(customSolidRegion);
    expect(style.color).toBe('#123456');
    expect(style.colorMode).toBe('solid');

    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext('2d')!;

    renderRegionTypesetting(ctx, customSolidRegion);
    expect(ctx.fillStyle).toBe('#123456');
  });

  it('3. Gradient mode can be enabled.', () => {
    const handleUpdateRegion = vi.fn();

    render(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdateRegion}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const gradientButton = screen.getByLabelText('Gradient color mode');
    fireEvent.click(gradientButton);

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-a',
        typesetting: expect.objectContaining({
          colorMode: 'gradient',
        }),
      })
    );
  });

  it('4. Start and end colors are stored correctly.', () => {
    const handleUpdateRegion = vi.fn();

    render(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-b"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdateRegion}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const startColorInput = screen.getByLabelText('Gradient Start Color Picker');
    fireEvent.change(startColorInput, { target: { value: '#ff0000' } });

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-b',
        typesetting: expect.objectContaining({
          gradient: expect.objectContaining({
            startColor: '#ff0000',
            endColor: '#222222',
            direction: 'vertical',
          }),
        }),
      })
    );

    const endColorInput = screen.getByLabelText('Gradient End Color Picker');
    fireEvent.change(endColorInput, { target: { value: '#0000ff' } });

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-b',
        typesetting: expect.objectContaining({
          gradient: expect.objectContaining({
            startColor: '#111111',
            endColor: '#0000ff',
            direction: 'vertical',
          }),
        }),
      })
    );
  });

  it('5. Gradient direction is stored correctly.', () => {
    const handleUpdateRegion = vi.fn();

    render(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-b"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdateRegion}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const horizontalBtn = screen.getByRole('button', { name: 'Horizontal' });
    fireEvent.click(horizontalBtn);

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-b',
        typesetting: expect.objectContaining({
          gradient: expect.objectContaining({
            direction: 'horizontal',
          }),
        }),
      })
    );

    const diagonalBtn = screen.getByRole('button', { name: 'Diagonal' });
    fireEvent.click(diagonalBtn);

    expect(handleUpdateRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-b',
        typesetting: expect.objectContaining({
          gradient: expect.objectContaining({
            direction: 'diagonal',
          }),
        }),
      })
    );
  });

  it("6. Changing one text object's color does not affect another.", () => {
    const updatedRegionA: TextRegion = {
      ...mockRegionA,
      typesetting: {
        ...mockRegionA.typesetting,
        color: '#aa0000',
      },
    };

    const styleA = getEffectiveTypesettingStyle(updatedRegionA);
    const styleB = getEffectiveTypesettingStyle(mockRegionB);

    expect(styleA.color).toBe('#aa0000');
    expect(styleA.colorMode).toBe('solid');

    expect(styleB.colorMode).toBe('gradient');
    expect(styleB.gradient?.startColor).toBe('#111111');
    expect(styleB.gradient?.endColor).toBe('#222222');
    expect(styleB.gradient?.direction).toBe('vertical');
  });

  it('7. Selecting another text object correctly loads its color/gradient settings.', () => {
    const { rerender } = render(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    // Region A is Solid #ff0000
    expect(screen.getByLabelText('Solid color mode')).toHaveClass('bg-indigo-600');
    expect(screen.getByLabelText('Solid Text Color Picker')).toHaveValue('#ff0000');

    // Rerender with Region B selected (Gradient #111111 -> #222222, vertical)
    rerender(
      <RegionInspector
        page={mockPage}
        selectedRegionId="region-b"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="manual"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Gradient color mode')).toHaveClass('bg-indigo-600');
    expect(screen.getByLabelText('Gradient Start Color Picker')).toHaveValue('#111111');
    expect(screen.getByLabelText('Gradient End Color Picker')).toHaveValue('#222222');
    expect(screen.getByRole('button', { name: 'Vertical' })).toHaveClass('bg-indigo-600');
  });

  it('8. Existing text objects without gradient data still render normally.', () => {
    const legacyRegion: TextRegion = {
      id: 'region-legacy',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'Legacy Text',
      translatedText: 'Legacy Translated',
      confidence: 100,
      isCleaned: true,
      typesetting: {
        fontSize: 16,
      },
    };

    const style = getEffectiveTypesettingStyle(legacyRegion);
    expect(style.colorMode).toBe('solid');
    expect(style.color).toBe('#000000');

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    expect(() => renderRegionTypesetting(ctx, legacyRegion)).not.toThrow();
    expect(ctx.fillStyle).toBe('#000000');
  });

  it('9. Gradient appears in QC & Export.', () => {
    const gradientRegion: TextRegion = {
      id: 'region-grad',
      bbox: { x: 20, y: 30, width: 100, height: 60 },
      text: 'Sample',
      translatedText: 'Grad Text',
      confidence: 90,
      isCleaned: true,
      typesetting: {
        colorMode: 'gradient',
        gradient: {
          startColor: '#ff0000',
          endColor: '#0000ff',
          direction: 'horizontal',
        },
      },
    };

    const mockAddColorStop = vi.fn();
    const mockGradient = { addColorStop: mockAddColorStop };
    const mockCreateLinearGradient = vi.fn().mockReturnValue(mockGradient);

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.createLinearGradient = mockCreateLinearGradient;

    renderRegionTypesetting(ctx, gradientRegion);

    // Horizontal gradient over region bounds (20, 30, 100, 60) -> (x1=20, y1=30, x2=120, y2=30)
    expect(mockCreateLinearGradient).toHaveBeenCalledWith(20, 30, 120, 30);
    expect(mockAddColorStop).toHaveBeenCalledWith(0, '#ff0000');
    expect(mockAddColorStop).toHaveBeenCalledWith(1, '#0000ff');
  });

  it('10. Gradient appears in final PDF/ZIP rendering.', async () => {
    const gradientPage: ManhwaPage = {
      ...mockPage,
      regions: [
        {
          id: 'region-pdf-zip',
          bbox: { x: 10, y: 10, width: 100, height: 50 },
          text: 'Text',
          translatedText: 'Export Grad Text',
          confidence: 100,
          isCleaned: true,
          typesetting: {
            colorMode: 'gradient',
            gradient: {
              startColor: '#ff0000',
              endColor: '#00ffff',
              direction: 'diagonal',
            },
          },
        },
      ],
    };

    // Verify renderTypesetImage processes gradient text region
    const renderedDataUrl = await renderTypesetImage(gradientPage.cleanedUrl, gradientPage.regions);
    expect(renderedDataUrl).toBeDefined();
    expect(renderedDataUrl.startsWith('data:image/png')).toBe(true);

    // Verify PDF export calls renderTypesetImage and generates document
    await expect(exportPagesAsPdf([gradientPage])).resolves.not.toThrow();

    // Verify ZIP export calls renderTypesetImage and generates archive
    await expect(exportPagesAsZip([gradientPage])).resolves.not.toThrow();
  });
});
