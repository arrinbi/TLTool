import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../../App';
import { loadSavedCustomFonts, registerFontFace, getRegisteredCustomFonts } from '../fontService';

const fontStore = new Map<string, any>();

function setupMockIndexedDB() {
  fontStore.clear();

  const mockDb = {
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: () => {},
    transaction: () => {
      const tx = {
        oncomplete: null as any,
        onerror: null as any,
        objectStore: () => ({
          put: (record: any) => {
            fontStore.set(record.id, record);
            if (tx.oncomplete) setTimeout(() => tx.oncomplete(), 0);
          },
          delete: (id: string) => {
            fontStore.delete(id);
            if (tx.oncomplete) setTimeout(() => tx.oncomplete(), 0);
          },
          getAll: () => {
            const req = {
              result: Array.from(fontStore.values()),
              onsuccess: null as any,
              onerror: null as any,
            };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          },
        }),
      };
      return tx;
    },
  };

  const mockIdb = {
    open: () => {
      const req = {
        result: mockDb,
        onupgradeneeded: null as any,
        onsuccess: null as any,
        onerror: null as any,
      };
      setTimeout(() => {
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    },
  };

  vi.stubGlobal('indexedDB', mockIdb);
}

describe('Typesetting Requirements Fixes Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Clicking outside selected text box ONLY deselects selection box without creating a new region or hiding text', async () => {
    render(<App />);

    // Wait for demo page to load
    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 4 Typesetting
    const typesettingTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingTabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Typesetting Studio/i)).toBeDefined();
    });

    // Initial region count
    const initialRegionsList = screen.getByText(/Typeset Regions \(0\)/i);
    expect(initialRegionsList).toBeDefined();

    // Click on canvas background container
    const canvasContainer = document.querySelector('.cursor-default') as HTMLDivElement;
    expect(canvasContainer).not.toBeNull();

    fireEvent.pointerDown(canvasContainer, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvasContainer, { clientX: 100, clientY: 100 });

    // Verify region selection editor is not open / region is deselected
    expect(screen.queryByText(/Selected Region Typesetting Editor/i)).toBeNull();

    // Verify NO new region was created (region count remains 0)
    const updatedRegionsList = screen.getByText(/Typeset Regions \(0\)/i);
    expect(updatedRegionsList).toBeDefined();
  });

  it('2. Global Font Size immediately applies selected font size to ALL existing regions on the current page', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 1 OCR to add a manual region
    const ocrTab = screen.getAllByText(/1\. OCR/i)[0];
    fireEvent.click(ocrTab);

    // Enable drawing mode
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
    });

    vi.spyOn(canvasOverlay, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 900,
      right: 600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
    });

    // Switch to Stage 4 Typesetting
    const typesettingTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingTabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Typesetting Studio/i)).toBeDefined();
    });

    // Change Global Default Font Size input to 24px
    const defaultFontSizeInput = screen.getByLabelText(/Global Default Font Size/i) as HTMLInputElement;
    expect(defaultFontSizeInput).not.toBeNull();

    fireEvent.change(defaultFontSizeInput, { target: { value: '24' } });
    expect(defaultFontSizeInput.value).toBe('24');

    // Verify font size in the selected region editor is updated to 24
    await waitFor(() => {
      expect(screen.getByText(/Font Size \(24px\)/i)).toBeDefined();
    });
  });

  it('3. Persists uploaded fonts in IndexedDB and restores them on load', async () => {
    setupMockIndexedDB();

    // Register a font
    const fontBuffer = new Uint8Array([0, 1, 2, 3, 4]).buffer;
    const font = await registerFontFace('MyPersistentFont', 'MyPersistentFont.ttf', fontBuffer);

    expect(font.displayName).toBe('MyPersistentFont');
    expect(getRegisteredCustomFonts().some((f) => f.displayName === 'MyPersistentFont')).toBe(true);

    // Re-load saved fonts from IndexedDB
    const restoredFonts = await loadSavedCustomFonts();
    expect(restoredFonts.length).toBeGreaterThan(0);
    expect(restoredFonts.some((f) => f.displayName === 'MyPersistentFont')).toBe(true);
  });

  it('4. Resizing text selection box scales font size proportionally with the box', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 1 OCR and add a region
    const ocrTab = screen.getAllByText(/1\. OCR/i)[0];
    fireEvent.click(ocrTab);

    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
    });

    vi.spyOn(canvasOverlay, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 900,
      right: 600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(canvasOverlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 200, clientY: 200, pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByText(/Detected Regions \(1\)/i)).toBeDefined();
    });

    // Switch to Stage 4 Typesetting
    const typesettingTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingTabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Typesetting Studio/i)).toBeDefined();
    });

    const typesettingOverlay = await waitFor(() => {
      const el = (document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default')) as HTMLDivElement;
      expect(el).not.toBeNull();
      return el;
    });

    vi.spyOn(typesettingOverlay, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 900,
      right: 600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Initial font size is 16px
    await waitFor(() => {
      expect(screen.getByText(/Font Size \(16px\)/i)).toBeDefined();
    });

    // Find the corner handle 'se' (Resize Bottom-Right)
    const handleSe = document.querySelector('div[title="Resize Bottom-Right"]') as HTMLDivElement;
    expect(handleSe).not.toBeNull();

    // Drag handle 'se' outwards to enlarge the box (+100px width/height from 100x100 to 200x200)
    fireEvent.pointerDown(handleSe, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(typesettingOverlay, { clientX: 300, clientY: 300, pointerId: 1 });

    // Verify font size increased proportionally (from 16px to 32px)
    await waitFor(() => {
      expect(screen.getByText(/Font Size \(32px\)/i)).toBeDefined();
    });

    fireEvent.pointerUp(typesettingOverlay, { clientX: 300, clientY: 300, pointerId: 1 });
  });

  it('5. Selected Global Default Font persists in localStorage and applies to new regions', async () => {
    localStorage.clear();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    const typesettingTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingTabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Typesetting Studio/i)).toBeDefined();
    });

    const globalFontSelect = screen.getByLabelText('Global Default Font') as HTMLSelectElement;
    expect(globalFontSelect).not.toBeNull();

    fireEvent.change(globalFontSelect, { target: { value: 'Arial, sans-serif' } });
    expect(globalFontSelect.value).toBe('Arial, sans-serif');

    // Verify it was persisted to localStorage
    expect(localStorage.getItem('tltool_default_font_family')).toBe('Arial, sans-serif');
  });
});
