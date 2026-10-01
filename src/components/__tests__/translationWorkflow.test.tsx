import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import * as ocrService from '../../modules/ocr/ocrService';

// Mock Tesseract worker to avoid network downloads during UI integration test
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'MOCK OCR TEXT',
        blocks: [],
      },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Translation MVP Workflow Integration', () => {
  it('1. Displays original text and Indonesian translation section in Stage 2 Translation panel and allows manual translation edit without overwriting original text', async () => {
    vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('WHAT IS THIS?!');
    vi.spyOn(ocrService, 'detectTextRegions').mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 130, y: 155, width: 100, height: 40 },
        text: 'WHAT IS THIS?!',
        confidence: 95,
        isCleaned: false,
        isManual: false,
        source: 'auto',
      },
    ]);

    render(<App />);

    // Stage 1: Click Automatic Detection to populate regions
    const autoBtn = await waitFor(() => screen.getAllByRole('button', { name: /Automatic Detection/i })[0]);
    fireEvent.click(autoBtn);

    // Switch to Stage 2: Translation
    const stage2Btn = await waitFor(() => screen.getByRole('button', { name: /2\. Translation/i }));
    fireEvent.click(stage2Btn);

    // Verify Stage 2 Translation Studio panel is active and OCR/Cleaning controls are hidden
    expect(screen.getByText('Translation Studio')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Clean All/i })).toBeNull();

    // Wait for detected region item and select it
    const regionItem = await waitFor(() => screen.getByText(/WHAT IS THIS\?!/i));
    fireEvent.click(regionItem);

    // Verify Read-Only Original Text label and content
    expect(screen.getByText('Original Text')).toBeDefined();
    const originalTextarea = screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement;
    expect(originalTextarea.value).toBe('WHAT IS THIS?!');
    expect(originalTextarea.readOnly).toBe(true);

    // Verify Indonesian Translation label and field
    expect(screen.getByText('Indonesian Translation')).toBeDefined();
    const translationTextarea = screen.getByPlaceholderText('Indonesian translation output...') as HTMLTextAreaElement;
    expect(translationTextarea.value).toBe('');

    // User manually corrects/edits translation field
    fireEvent.change(translationTextarea, { target: { value: 'APA INI MANHWA?!' } });

    // Verify translation updated and original OCR text remains unchanged
    expect(translationTextarea.value).toBe('APA INI MANHWA?!');
    expect(originalTextarea.value).toBe('WHAT IS THIS?!');
  });

  it('2. Clicking Translate on selected region in Stage 2 fetches translation and updates UI while preserving original text', async () => {
    vi.spyOn(ocrService, 'recognizeRegionText').mockResolvedValue('WHAT IS THIS?!');
    vi.spyOn(ocrService, 'detectTextRegions').mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 130, y: 155, width: 100, height: 40 },
        text: 'WHAT IS THIS?!',
        confidence: 95,
        isCleaned: false,
        isManual: false,
        source: 'auto',
      },
    ]);

    render(<App />);

    // Stage 1: Click Automatic Detection
    const autoBtn = await waitFor(() => screen.getAllByRole('button', { name: /Automatic Detection/i })[0]);
    fireEvent.click(autoBtn);

    // Switch to Stage 2: Translation
    const stage2Btn = await waitFor(() => screen.getByRole('button', { name: /2\. Translation/i }));
    fireEvent.click(stage2Btn);

    // Select first region
    const regionItem = await waitFor(() => screen.getByText(/WHAT IS THIS\?!/i));
    fireEvent.click(regionItem);

    // Find and click single region Translate button
    const translateButton = screen.getByRole('button', { name: /^Translate$/i });
    fireEvent.click(translateButton);

    // Verify translation updated to Indonesian
    const translationTextarea = await waitFor(
      () => screen.getByPlaceholderText('Indonesian translation output...') as HTMLTextAreaElement
    );
    expect(translationTextarea.value).toBe('APA INI?!');

    // Verify original OCR text remains preserved
    const originalTextarea = screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement;
    expect(originalTextarea.value).toBe('WHAT IS THIS?!');
  });

  it('3. Clicking Translate All in Stage 2 translates all regions in page bulk action', async () => {
    vi.spyOn(ocrService, 'recognizeRegionText').mockImplementation(async (_img, bbox) => {
      if (bbox.y < 300) return 'WHAT IS THIS?!';
      return 'THE MANHWA HAS';
    });
    vi.spyOn(ocrService, 'detectTextRegions').mockResolvedValue([
      {
        id: 'auto-1',
        bbox: { x: 130, y: 155, width: 100, height: 40 },
        text: '',
        confidence: 95,
        isCleaned: false,
        isManual: false,
        source: 'auto',
      },
      {
        id: 'auto-2',
        bbox: { x: 310, y: 595, width: 100, height: 40 },
        text: '',
        confidence: 95,
        isCleaned: false,
        isManual: false,
        source: 'auto',
      },
    ]);

    render(<App />);

    // Stage 1: Run Automatic Detection to detect regions
    const autoBtn = await waitFor(() => screen.getAllByRole('button', { name: /Automatic Detection/i })[0]);
    fireEvent.click(autoBtn);

    await waitFor(() => screen.getByText(/WHAT IS THIS\?!/i));

    // Switch to Stage 2: Translation
    const stage2Btn = await waitFor(() => screen.getByRole('button', { name: /2\. Translation/i }));
    fireEvent.click(stage2Btn);

    // Find and click Translate All button in Stage 2 panel
    const translateAllButton = screen.getByRole('button', { name: /Translate All/i });
    fireEvent.click(translateAllButton);

    // Select second region and check its translation
    const secondRegionItem = await waitFor(() => screen.getByText(/THE MANHWA HAS/i));
    fireEvent.click(secondRegionItem);

    const translationTextarea = await waitFor(
      () => screen.getByPlaceholderText('Indonesian translation output...') as HTMLTextAreaElement
    );
    expect(translationTextarea.value).toBe('MANHWA INI TELAH');

    // Original text must remain untouched
    const originalTextarea = screen.getByPlaceholderText('OCR Text output...') as HTMLTextAreaElement;
    expect(originalTextarea.value).toBe('THE MANHWA HAS');
  });
});
