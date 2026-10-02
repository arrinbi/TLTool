import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { RegionInspector } from '../RegionInspector';
import { RegionOverlay } from '../RegionOverlay';
import type { ManhwaPage, TextRegion } from '../../types';

describe('Typesetting QC & Alignment Editor Workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleRegion: TextRegion = {
    id: 'region-qc-1',
    bbox: { x: 100, y: 100, width: 200, height: 100 },
    text: 'Original OCR',
    confidence: 95,
    isCleaned: true,
    translatedText: 'Translated Text',
  };

  const samplePage: ManhwaPage = {
    id: 'page-qc-1',
    name: 'test_page.png',
    file: new File([], 'test_page.png', { type: 'image/png' }),
    originalUrl: 'data:image/png;base64,sample',
    cleanedUrl: 'data:image/png;base64,sample',
    width: 600,
    height: 800,
    history: [],
    historyIndex: -1,
    isProcessing: false,
    regions: [sampleRegion],
  };

  it('switches to Stage 4 and displays Typesetting QC panel controls in App', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sample_Manhwa_Page_01.png')).toBeInTheDocument();
    });

    const qcStageBtn = screen.getByText('4. QC & Export');
    fireEvent.click(qcStageBtn);

    await waitFor(() => {
      expect(screen.getByText('Typesetting QC & Alignment')).toBeInTheDocument();
      expect(screen.getByText('Technical Validation Check')).toBeInTheDocument();
    });
  });

  it('renders RegionInspector in Stage 4 with region selection and layout actions', () => {
    const handleUpdate = vi.fn();
    const handleSelect = vi.fn();

    render(
      <RegionInspector
        page={samplePage}
        selectedRegionId="region-qc-1"
        activeStage="qc"
        onSelectRegion={handleSelect}
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

    expect(screen.getByText('Typesetting QC & Alignment')).toBeInTheDocument();
    expect(screen.getByText('Layout Actions')).toBeInTheDocument();
    expect(screen.getByText('Fit Box to Region')).toBeInTheDocument();
    expect(screen.getByText('Auto Fit Text')).toBeInTheDocument();
    expect(screen.getByText('Center Both')).toBeInTheDocument();
    expect(screen.getByText('Alignment Status')).toBeInTheDocument();
  });

  it('triggers Center Both and updates region alignment metadata without touching OCR bbox', () => {
    let currentRegion = { ...sampleRegion };
    const handleUpdate = vi.fn((reg: TextRegion) => {
      currentRegion = reg;
    });

    render(
      <RegionInspector
        page={{ ...samplePage, regions: [currentRegion] }}
        selectedRegionId="region-qc-1"
        activeStage="qc"
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

    const centerBothBtn = screen.getByText('Center Both');
    fireEvent.click(centerBothBtn);

    expect(handleUpdate).toHaveBeenCalled();
    expect(currentRegion.typesetting?.align).toBe('center');
    expect(currentRegion.typesetting?.vAlign).toBe('middle');
    // Ensure OCR bbox is strictly unchanged
    expect(currentRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('allows changing box padding without modifying OCR bbox', () => {
    let currentRegion = { ...sampleRegion };
    const handleUpdate = vi.fn((reg: TextRegion) => {
      currentRegion = reg;
    });

    render(
      <RegionInspector
        page={{ ...samplePage, regions: [currentRegion] }}
        selectedRegionId="region-qc-1"
        activeStage="qc"
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

    const paddingInputs = screen.getAllByDisplayValue('4');
    fireEvent.change(paddingInputs[0], { target: { value: '15' } });

    expect(handleUpdate).toHaveBeenCalled();
    expect(currentRegion.typesetting?.padding).toBe(15);
    expect(currentRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('allows updating position X, Y, W, H without modifying OCR bbox', () => {
    let currentRegion = { ...sampleRegion };
    const handleUpdate = vi.fn((reg: TextRegion) => {
      currentRegion = reg;
    });

    render(
      <RegionInspector
        page={{ ...samplePage, regions: [currentRegion] }}
        selectedRegionId="region-qc-1"
        activeStage="qc"
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

    const inputs100 = screen.getAllByDisplayValue('100');
    const xInput = inputs100[0]; // First 100 input is X
    fireEvent.change(xInput, { target: { value: '150' } });

    expect(handleUpdate).toHaveBeenCalled();
    expect(currentRegion.typesetting?.bounds?.x).toBe(150);
    // OCR bbox remains unchanged!
    expect(currentRegion.bbox).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('renders interactive visual typesetting box and 8 resize handles on RegionOverlay in Stage 4', () => {
    render(
      <RegionOverlay
        imageWidth={600}
        imageHeight={800}
        displayWidth={600}
        displayHeight={800}
        regions={[sampleRegion]}
        selectedRegionId="region-qc-1"
        activeStage="qc"
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onAddRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        isDrawingMode={false}
      />
    );

    expect(screen.getByTitle('Resize Top-Left')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Top-Right')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Bottom-Left')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Bottom-Right')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Top')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Bottom')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Left')).toBeInTheDocument();
    expect(screen.getByTitle('Resize Right')).toBeInTheDocument();
  });
});
