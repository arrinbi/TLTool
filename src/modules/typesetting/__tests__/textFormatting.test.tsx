import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { TextRegion, ManhwaPage } from '../../../types';
import { RegionInspector } from '../../../components/RegionInspector';
import {
  getEffectiveTypesettingStyle,
  renderRegionTypesetting,
  renderTypesetImage,
} from '../typesettingService';

describe('Text Formatting Controls & Rendering (Bold, Italic, Underline, Strikethrough)', () => {
  const dummyPage: ManhwaPage = {
    id: 'page-1',
    name: 'Page 1',
    file: new File([], 'page1.png'),
    originalUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    cleanedUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 100,
    height: 100,
    regions: [
      {
        id: 'region-a',
        bbox: { x: 10, y: 10, width: 80, height: 30 },
        text: 'OCR Text A',
        confidence: 90,
        isCleaned: true,
        translatedText: 'Text A',
        typesetting: {
          fontWeight: 'bold',
          italic: true,
          underline: false,
          strikethrough: false,
        },
      },
      {
        id: 'region-b',
        bbox: { x: 10, y: 50, width: 80, height: 30 },
        text: 'OCR Text B',
        confidence: 90,
        isCleaned: true,
        translatedText: 'Text B',
        typesetting: {
          fontWeight: 'normal',
          italic: false,
          underline: true,
          strikethrough: true,
        },
      },
    ],
    history: [],
    historyIndex: -1,
    isProcessing: false,
  };

  const TestWrapper = ({ initialPage = dummyPage, initialSelectedId = 'region-a' }) => {
    const [page, setPage] = useState<ManhwaPage>(initialPage);
    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(initialSelectedId);

    const handleUpdateRegion = (updatedRegion: TextRegion) => {
      setPage((prev) => ({
        ...prev,
        regions: prev.regions.map((r) => (r.id === updatedRegion.id ? updatedRegion : r)),
      }));
    };

    return (
      <RegionInspector
        page={page}
        selectedRegionId={selectedRegionId}
        activeStage="typesetting"
        onSelectRegion={setSelectedRegionId}
        onUpdateRegion={handleUpdateRegion}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );
  };

  it('1. Bold toggle changes selected text font weight between bold and normal', () => {
    const singleRegionPage: ManhwaPage = {
      ...dummyPage,
      regions: [
        {
          id: 'region-1',
          bbox: { x: 0, y: 0, width: 50, height: 50 },
          text: 'Hello',
          confidence: 95,
          isCleaned: true,
          translatedText: 'Halo',
          typesetting: { fontWeight: 'normal' },
        },
      ],
    };

    const handleUpdate = vi.fn();

    render(
      <RegionInspector
        page={singleRegionPage}
        selectedRegionId="region-1"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdate}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const boldBtn = screen.getByRole('button', { name: /bold/i });
    expect(boldBtn).toBeInTheDocument();

    // Click Bold to enable bold
    fireEvent.click(boldBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-1',
        typesetting: expect.objectContaining({ fontWeight: 'bold' }),
      })
    );
  });

  it('2. Italic toggle flips italic boolean state on selected text region', () => {
    const handleUpdate = vi.fn();

    render(
      <RegionInspector
        page={dummyPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdate}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const italicBtn = screen.getByRole('button', { name: /italic/i });
    fireEvent.click(italicBtn);

    // Region A initially had italic: true, so toggling it sets italic: false
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-a',
        typesetting: expect.objectContaining({ italic: false }),
      })
    );
  });

  it('3. Underline toggle flips underline boolean state on selected text region', () => {
    const handleUpdate = vi.fn();

    render(
      <RegionInspector
        page={dummyPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdate}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const underlineBtn = screen.getByRole('button', { name: /underline/i });
    fireEvent.click(underlineBtn);

    // Region A initially had underline: false, so toggling sets underline: true
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-a',
        typesetting: expect.objectContaining({ underline: true }),
      })
    );
  });

  it('4. Strikethrough toggle flips strikethrough boolean state on selected text region', () => {
    const handleUpdate = vi.fn();

    render(
      <RegionInspector
        page={dummyPage}
        selectedRegionId="region-a"
        activeStage="typesetting"
        onSelectRegion={vi.fn()}
        onUpdateRegion={handleUpdate}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
      />
    );

    const strikethroughBtn = screen.getByRole('button', { name: /strikethrough/i });
    fireEvent.click(strikethroughBtn);

    // Region A initially had strikethrough: false, so toggling sets strikethrough: true
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'region-a',
        typesetting: expect.objectContaining({ strikethrough: true }),
      })
    );
  });

  it('5. Formatting state persists on the selected text object', () => {
    render(<TestWrapper initialSelectedId="region-a" />);

    const underlineBtn = screen.getByRole('button', { name: /underline/i });
    const strikethroughBtn = screen.getByRole('button', { name: /strikethrough/i });

    // Click underline and strikethrough
    fireEvent.click(underlineBtn);
    fireEvent.click(strikethroughBtn);

    // Active button styles should update to reflect persistent active state
    expect(underlineBtn.className).toContain('bg-indigo-600');
    expect(strikethroughBtn.className).toContain('bg-indigo-600');
  });

  it('6. Switching between text objects correctly updates formatting controls', () => {
    render(<TestWrapper initialSelectedId="region-a" />);

    const boldBtn = screen.getByRole('button', { name: /bold/i });
    const italicBtn = screen.getByRole('button', { name: /italic/i });
    const underlineBtn = screen.getByRole('button', { name: /underline/i });
    const strikethroughBtn = screen.getByRole('button', { name: /strikethrough/i });

    // Region A has Bold=ON, Italic=ON, Underline=OFF, Strikethrough=OFF
    expect(boldBtn.className).toContain('bg-indigo-600');
    expect(italicBtn.className).toContain('bg-indigo-600');
    expect(underlineBtn.className).not.toContain('bg-indigo-600');
    expect(strikethroughBtn.className).not.toContain('bg-indigo-600');

    // Switch to Region B (Bold=OFF, Italic=OFF, Underline=ON, Strikethrough=ON)
    const regionBItem = screen.getByText('Text B');
    fireEvent.click(regionBItem);

    // Region B buttons should update
    expect(boldBtn.className).not.toContain('bg-indigo-600');
    expect(italicBtn.className).not.toContain('bg-indigo-600');
    expect(underlineBtn.className).toContain('bg-indigo-600');
    expect(strikethroughBtn.className).toContain('bg-indigo-600');
  });

  it('7. Existing text objects without formatting fields still render normally', () => {
    const plainRegion: TextRegion = {
      id: 'plain-region',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'Plain Text',
      confidence: 99,
      isCleaned: true,
      translatedText: 'Plain Translated',
      // No typesetting formatting fields defined
    };

    const style = getEffectiveTypesettingStyle(plainRegion);
    expect(style.fontWeight).toBe('normal');
    expect(style.italic).toBe(false);
    expect(style.underline).toBe(false);
    expect(style.strikethrough).toBe(false);

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    expect(() => renderRegionTypesetting(ctx, plainRegion)).not.toThrow();
  });

  it('8. Formatting appears in the final render/export', async () => {
    const formattedRegion: TextRegion = {
      id: 'formatted-export-region',
      bbox: { x: 10, y: 10, width: 80, height: 40 },
      text: 'Original Text',
      confidence: 100,
      isCleaned: true,
      translatedText: 'Formatted Export Text',
      typesetting: {
        fontWeight: 'bold',
        italic: true,
        underline: true,
        strikethrough: true,
      },
    };

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    // Ensure mock canvas methods exist on context
    ctx.stroke = vi.fn();
    ctx.fillText = vi.fn();
    ctx.beginPath = vi.fn();
    ctx.moveTo = vi.fn();
    ctx.lineTo = vi.fn();
    ctx.save = vi.fn();
    ctx.restore = vi.fn();

    const strokeSpy = vi.spyOn(ctx, 'stroke');
    const fillTextSpy = vi.spyOn(ctx, 'fillText');

    renderRegionTypesetting(ctx, formattedRegion);

    // Verify ctx.font included italic and bold
    expect(ctx.font).toContain('italic');
    expect(ctx.font).toContain('bold');

    // Verify text was filled
    expect(fillTextSpy).toHaveBeenCalled();

    // Verify underline and strikethrough lines were stroked (2 lines -> 2 strokes)
    expect(strokeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Verify renderTypesetImage resolves successfully with formatting applied
    const exportedUrl = await renderTypesetImage(dummyPage.cleanedUrl, [formattedRegion]);
    expect(exportedUrl).toBeDefined();
    expect(exportedUrl.startsWith('data:image/png')).toBe(true);
  });
});
