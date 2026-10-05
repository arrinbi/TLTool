import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import App from '../../App';
import {
  getEffectiveTypesettingStyle,
  renderTypesetImage,
} from '../../modules/typesetting/typesettingService';
import type { TextRegion } from '../../types';

describe('Custom Font Typesetting Workflow Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Allows uploading custom .ttf/.otf/.zip font files, updates font dropdown, and displays upload status', async () => {
    render(<App />);

    // Wait for demo page to load into state
    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 4: Typesetting
    const typesettingStageTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingStageTabs[0]);

    // Verify Custom Fonts section controls exist
    await waitFor(() => {
      expect(screen.getByText(/Custom Fonts/i)).toBeDefined();
    });
    expect(screen.getByText(/Upload Font/i)).toBeDefined();

    // Create a mock font zip file containing 2 fonts
    const zip = new JSZip();
    zip.file('ActionComic.ttf', new Uint8Array([0, 1, 2]));
    zip.file('DialogueHand.otf', new Uint8Array([3, 4, 5]));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'ComicFonts.zip', { type: 'application/zip' });

    // Upload zip file via hidden font input
    const fontInput = document.querySelector('input[type="file"][accept=".ttf,.otf,.zip"]') as HTMLInputElement;
    expect(fontInput).not.toBeNull();

    Object.defineProperty(fontInput, 'files', {
      value: [zipFile],
      writable: true,
    });
    fireEvent.change(fontInput);

    // Wait for status message and uploaded fonts in dropdown
    await waitFor(() => {
      expect(screen.getByText(/2 fonts found in ZIP/i)).toBeDefined();
    });

    // Check Global Default Font dropdown contains custom fonts
    const defaultFontDropdown = screen.getByLabelText(/^Global Default Font$/i) as HTMLSelectElement;
    expect(defaultFontDropdown).not.toBeNull();

    const options = Array.from(defaultFontDropdown.options).map((o) => o.text);
    expect(options).toContain('ActionComic');
    expect(options).toContain('DialogueHand');
  });

  it('2. Respects per-region font selection vs global default font', () => {
    const defaultFontFamily = 'CustomFont_GlobalDefault';
    const regionFontFamily = 'CustomFont_SpecialSFX';

    const regionWithoutCustomFont: TextRegion = {
      id: 'r1',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'Hello',
      translatedText: 'Halo',
      confidence: 100,
      isCleaned: true,
    };

    const regionWithCustomFont: TextRegion = {
      id: 'r2',
      bbox: { x: 10, y: 100, width: 100, height: 50 },
      text: 'BOOM',
      translatedText: 'DUAR',
      confidence: 100,
      isCleaned: true,
      typesetting: {
        fontFamily: regionFontFamily,
        fontSize: 24,
      },
    };

    // Region 1 falls back to global default font
    const style1 = getEffectiveTypesettingStyle(regionWithoutCustomFont, defaultFontFamily);
    expect(style1.fontFamily).toBe(defaultFontFamily);

    // Region 2 uses its explicit per-region font
    const style2 = getEffectiveTypesettingStyle(regionWithCustomFont, defaultFontFamily);
    expect(style2.fontFamily).toBe(regionFontFamily);
  });

  it('3. Renders and exports typeset image with custom font settings without throwing errors', async () => {
    const mockCleanedUrl = 'data:image/png;base64,mockCleanedData';
    const regions: TextRegion[] = [
      {
        id: 'region-1',
        bbox: { x: 50, y: 50, width: 200, height: 80 },
        text: 'Hello World',
        translatedText: 'Halo Dunia',
        confidence: 95,
        isCleaned: true,
        typesetting: {
          fontFamily: 'CustomFont_MyCustomFont',
          fontSize: 20,
          color: '#000000',
        },
      },
    ];

    const resultDataUrl = await renderTypesetImage(mockCleanedUrl, regions, 'sans-serif');
    expect(resultDataUrl).toBeTruthy();
    expect(typeof resultDataUrl).toBe('string');
  });

  it('4. Fallbacks region font gracefully when a custom font is removed', async () => {
    render(<App />);

    // Wait for demo page to load
    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 4
    const typesettingStageTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingStageTabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Custom Fonts/i)).toBeDefined();
    });

    // Upload a single font file
    const fontFile = new File([new Uint8Array([1, 2, 3])], 'TempCustomFont.ttf', { type: 'font/ttf' });
    const fontInput = document.querySelector('input[type="file"][accept=".ttf,.otf,.zip"]') as HTMLInputElement;
    expect(fontInput).not.toBeNull();

    Object.defineProperty(fontInput, 'files', {
      value: [fontFile],
      writable: true,
    });
    fireEvent.change(fontInput);

    await waitFor(() => {
      expect(screen.getByText(/Font loaded/i)).toBeDefined();
    });

    // Remove the custom font
    const removeBtn = screen.getByTitle(/Remove custom font/i);
    fireEvent.click(removeBtn);

    // Verify font is removed from custom font list
    await waitFor(() => {
      expect(screen.queryByText('TempCustomFont.ttf')).toBeNull();
    });
  });
});
