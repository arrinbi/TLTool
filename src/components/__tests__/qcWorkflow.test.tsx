import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { runQualityControl } from '../../modules/qc/qcService';
import type { ManhwaPage } from '../../types';

describe('Quality Control (QC) Service & Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const samplePage: ManhwaPage = {
    id: 'page-qc-1',
    name: 'test_qc.png',
    file: new File([], 'test_qc.png', { type: 'image/png' }),
    originalUrl: 'data:image/png;base64,sample',
    cleanedUrl: 'data:image/png;base64,sample',
    width: 600,
    height: 800,
    history: [],
    historyIndex: -1,
    isProcessing: false,
    regions: [
      {
        id: 'r1',
        bbox: { x: 100, y: 100, width: 200, height: 100 },
        text: 'HELLO WORLD',
        confidence: 95,
        isCleaned: true,
        translatedText: '', // ERROR: text exists but translatedText empty
      },
      {
        id: 'r2',
        bbox: { x: 100, y: 300, width: 200, height: 100 },
        text: '',
        confidence: 90,
        isCleaned: true,
        translatedText: 'HALO DUNIA', // WARNING: translatedText exists but text empty; ERROR: translated but no typesetting
      },
      {
        id: 'r3',
        bbox: { x: 100, y: 500, width: 200, height: 100 },
        text: 'SAME TEXT',
        confidence: 90,
        isCleaned: false, // WARNING: uncleaned region containing text/translation
        translatedText: 'SAME TEXT', // WARNING: identical translation
        typesetting: {
          fontSize: 8, // WARNING: font size < 10
        },
      },
      {
        id: 'r4',
        bbox: { x: 100, y: 700, width: 500, height: 20 }, // WARNING: extreme aspect ratio (500/20 = 25 > 6)
        text: 'VERY WIDE BOX WITH A LOT OF LONG TEXT THAT OVERFLOWS',
        confidence: 85,
        isCleaned: true,
        translatedText: 'TEKS SANGAT PANJANG YANG AKAN MELIMPAH KELUAR DARI KOTAK',
        typesetting: {
          fontSize: 16,
        },
      },
    ],
  };

  describe('QC Logic Rules in runQualityControl', () => {
    it('generates summary metrics and detects translation, typesetting, and cleaning errors/warnings', () => {
      const report = runQualityControl(samplePage, 'sans-serif');

      expect(report.summary.totalRegions).toBe(4);
      expect(report.summary.translated).toBe(3); // r2, r3, r4
      expect(report.summary.untranslated).toBe(1); // r1
      expect(report.summary.typeset).toBe(2); // r3, r4
      expect(report.summary.notTypeset).toBe(2); // r1, r2

      // Check detected issues
      const r1Issues = report.issues.filter((i) => i.regionId === 'r1');
      expect(r1Issues.some((i) => i.severity === 'error' && i.category === 'translation')).toBe(true);

      const r2Issues = report.issues.filter((i) => i.regionId === 'r2');
      expect(r2Issues.some((i) => i.severity === 'warning' && i.category === 'translation')).toBe(true);
      expect(r2Issues.some((i) => i.severity === 'error' && i.category === 'typesetting')).toBe(true);

      const r3Issues = report.issues.filter((i) => i.regionId === 'r3');
      expect(r3Issues.some((i) => i.severity === 'warning' && i.category === 'translation')).toBe(true); // identical
      expect(r3Issues.some((i) => i.severity === 'warning' && i.category === 'typesetting')).toBe(true); // small font < 10
      expect(r3Issues.some((i) => i.severity === 'warning' && i.category === 'cleaning')).toBe(true); // uncleaned

      const r4Issues = report.issues.filter((i) => i.regionId === 'r4');
      expect(r4Issues.some((i) => i.severity === 'warning' && i.category === 'typesetting')).toBe(true); // extreme aspect ratio or overflow
    });

    it('returns 0 errors/warnings for perfectly cleaned, translated, and typeset regions', () => {
      const cleanPage: ManhwaPage = {
        ...samplePage,
        regions: [
          {
            id: 'perfect-1',
            bbox: { x: 100, y: 100, width: 200, height: 100 },
            text: 'Hello',
            confidence: 99,
            isCleaned: true,
            translatedText: 'Halo',
            typesetting: {
              fontSize: 18,
              fontFamily: 'sans-serif',
            },
          },
        ],
      };

      const report = runQualityControl(cleanPage, 'sans-serif');
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(0);
      expect(report.issues.length).toBe(0);
    });
  });

  describe('QC UI Workspace Integration', () => {
    it('switches to Stage 4 QC & Export workspace and displays QC panel controls', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Sample_Manhwa_Page_01.png')).toBeInTheDocument();
      });

      const qcStageBtn = screen.getByText('5. QC & Export');
      expect(qcStageBtn).toBeInTheDocument();

      fireEvent.click(qcStageBtn);

      await waitFor(() => {
        expect(screen.getByText('Final Preview & Export')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Run Check|Re-check/ })).toBeInTheDocument();
      });
    });

    it('runs QC on button click and shows issue summary metrics and issue list', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Sample_Manhwa_Page_01.png')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('5. QC & Export'));

      await waitFor(() => {
        expect(screen.getByText('Technical Validation Check')).toBeInTheDocument();
      });

      const runQcBtn = screen.getByRole('button', { name: /Run Check|Re-check/ });
      fireEvent.click(runQcBtn);

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('Errors')).toBeInTheDocument();
        expect(screen.getByText('Warns')).toBeInTheDocument();
      });
    });

    it('triggers Export Safeguard modal when trying to export before running QC or with warnings', async () => {
      render(<App />);

      // Wait for page to be loaded and selected
      await waitFor(() => {
        expect(screen.getByText('Sample_Manhwa_Page_01.png')).toBeInTheDocument();
      });

      const exportBtn = screen.getByText('Export Cleaned Page');
      expect(exportBtn).not.toBeDisabled();
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(screen.getByText('QC Analysis Not Run')).toBeInTheDocument();
        expect(screen.getByText('Cancel & Run QC')).toBeInTheDocument();
        expect(screen.getByText('Export Anyway')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel & Run QC'));

      await waitFor(() => {
        expect(screen.getByText('Final Preview & Export')).toBeInTheDocument();
      });
    });
  });
});
