import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { RegionInspector } from '../RegionInspector';
import { RegionOverlay } from '../RegionOverlay';
import type { ManhwaPage, TextRegion } from '../../types';

describe('Final Preview & Export Stage (Stage 4)', () => {
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

  it('switches to Stage 4 and displays Final Preview & Export controls in App', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sample_Manhwa_Page_01.png')).toBeInTheDocument();
    });

    const qcStageBtn = screen.getByText('5. QC & Export');
    fireEvent.click(qcStageBtn);

    await waitFor(() => {
      expect(screen.getByText('Final Preview & Export')).toBeInTheDocument();
      expect(screen.getByText('Export All as PDF')).toBeInTheDocument();
      expect(screen.getByText('Export All as ZIP')).toBeInTheDocument();
    });
  });

  it('renders RegionInspector in Stage 4 without editing controls', () => {
    render(
      <RegionInspector
        page={samplePage}
        selectedRegionId="region-qc-1"
        activeStage="qc"
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
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

    expect(screen.getByText('Final Preview & Export')).toBeInTheDocument();
    expect(screen.getByText('EXPORT')).toBeInTheDocument();
    expect(screen.getByText('Visual Check Summary')).toBeInTheDocument();

    // Verify editing controls are NOT present
    expect(screen.queryByText('Selected Region')).not.toBeInTheDocument();
    expect(screen.queryByText('Layout Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Fit Box to Region')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto Fit Text')).not.toBeInTheDocument();
    expect(screen.queryByText('Center Both')).not.toBeInTheDocument();
  });

  it('does NOT render editing overlays, resize handles, or guides on RegionOverlay in Stage 4', () => {
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

    // Editing handles must NOT be rendered in Stage 4
    expect(screen.queryByTitle('Resize Top-Left')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Top-Right')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Bottom-Left')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Bottom-Right')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Top')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Bottom')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Left')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resize Right')).not.toBeInTheDocument();
  });

  it('triggers PDF and ZIP exports when clicking export buttons in RegionInspector', () => {
    const handleExportPdf = vi.fn();
    const handleExportZip = vi.fn();

    render(
      <RegionInspector
        page={samplePage}
        selectedRegionId="region-qc-1"
        activeStage="qc"
        onSelectRegion={vi.fn()}
        onUpdateRegion={vi.fn()}
        onDeleteRegion={vi.fn()}
        detectionMode="auto"
        onSelectDetectionMode={vi.fn()}
        manualCategory="bubble-oval"
        onSelectManualCategory={vi.fn()}
        onRunOcr={vi.fn()}
        onCleanRegion={vi.fn()}
        onCleanAllRegions={vi.fn()}
        onRevertRegion={vi.fn()}
        onExportPdf={handleExportPdf}
        onExportZip={handleExportZip}
      />
    );

    fireEvent.click(screen.getByText('Export All as PDF'));
    expect(handleExportPdf).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Export All as ZIP'));
    expect(handleExportZip).toHaveBeenCalledTimes(1);
  });
});
