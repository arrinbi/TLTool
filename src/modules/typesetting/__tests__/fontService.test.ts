import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  processFontUpload,
  unregisterCustomFont,
  getRegisteredCustomFonts,
  registerFontFace,
  ensureFontLoaded,
} from '../fontService';

describe('FontService Custom Font Management', () => {
  beforeEach(() => {
    // Clear registered fonts before each test
    const registered = getRegisteredCustomFonts();
    for (const font of registered) {
      unregisterCustomFont(font.id);
    }
  });

  it('1. Uploads and registers a valid standalone .ttf or .otf file', async () => {
    const fontData = new Uint8Array([0, 1, 0, 0, 0, 12, 0, 1, 0, 0, 0, 0]).buffer;
    const file = new File([fontData], 'AnimeComicFont.ttf', { type: 'font/ttf' });

    const result = await processFontUpload(file);

    expect(result.error).toBeFalsy();
    expect(result.statusMessage).toBe('Font loaded');
    expect(result.fonts.length).toBe(1);
    expect(result.fonts[0].displayName).toBe('AnimeComicFont');
    expect(result.fonts[0].fileName).toBe('AnimeComicFont.ttf');
    expect(result.fonts[0].sourceType).toBe('custom');
    expect(getRegisteredCustomFonts().length).toBe(1);
  });

  it('2. Recursively extracts and registers all .ttf and .otf files from a ZIP archive', async () => {
    const zip = new JSZip();
    zip.file('RootFont.ttf', new Uint8Array([1, 2, 3]));
    zip.file('readme.txt', 'This is not a font file');
    const subfolder = zip.folder('nested/subfolder/fonts');
    subfolder?.file('NestedComicFont.otf', new Uint8Array([4, 5, 6]));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'FontPack.zip', { type: 'application/zip' });

    const result = await processFontUpload(zipFile);

    expect(result.error).toBeFalsy();
    expect(result.statusMessage).toBe('2 fonts found in ZIP');
    expect(result.fonts.length).toBe(2);

    const names = result.fonts.map((f) => f.displayName);
    expect(names).toContain('RootFont');
    expect(names).toContain('NestedComicFont');
    expect(getRegisteredCustomFonts().length).toBe(2);
  });

  it('3. Handles corrupted ZIP files gracefully without crashing', async () => {
    const corruptedBuffer = new Uint8Array([80, 75, 3, 4, 99, 99, 99]).buffer;
    const corruptedFile = new File([corruptedBuffer], 'corrupted.zip', { type: 'application/zip' });

    const result = await processFontUpload(corruptedFile);

    expect(result.error).toBe(true);
    expect(result.statusMessage).toBe('Could not read ZIP');
    expect(result.fonts.length).toBe(0);
  });

  it('4. Rejects unsupported file formats with status message', async () => {
    const invalidFile = new File(['text content'], 'document.pdf', { type: 'application/pdf' });

    const result = await processFontUpload(invalidFile);

    expect(result.error).toBe(true);
    expect(result.statusMessage).toBe('Unsupported file');
    expect(result.fonts.length).toBe(0);
  });

  it('5. Avoids duplicate font entries when uploading duplicate font files', async () => {
    const fontData = new Uint8Array([0, 1, 0, 0]).buffer;
    const file1 = new File([fontData], 'MangaFont.ttf', { type: 'font/ttf' });
    const file2 = new File([fontData], 'MangaFont.ttf', { type: 'font/ttf' });

    const result1 = await processFontUpload(file1);
    expect(result1.statusMessage).toBe('Font loaded');
    expect(result1.fonts.length).toBe(1);

    const result2 = await processFontUpload(file2, result1.fonts);
    expect(result2.statusMessage).toBe('Font already added');
    expect(result2.fonts.length).toBe(0);
    expect(getRegisteredCustomFonts().length).toBe(1);
  });

  it('6. Unregisters custom font and releases resources cleanly', async () => {
    const fontData = new Uint8Array([0, 1, 0, 0]).buffer;
    const font = await registerFontFace('TempFont', 'TempFont.ttf', fontData);

    expect(getRegisteredCustomFonts().length).toBe(1);

    unregisterCustomFont(font.id);
    expect(getRegisteredCustomFonts().length).toBe(0);
  });

  it('7. ensureFontLoaded completes safely without error', async () => {
    await expect(ensureFontLoaded('sans-serif')).resolves.not.toThrow();
    await expect(ensureFontLoaded('CustomFont_TestFamily')).resolves.not.toThrow();
  });
});
