import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../../App';
import { loadSavedCustomFonts, registerFontFace, getRegisteredCustomFonts } from '../fontService';
import { getEffectiveTypesettingStyle } from '../typesettingService';
import type { TextRegion } from '../../../types';

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

  it('2. Global Default Font Size sets default font size for new regions without changing existing regions', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 4 Typesetting
    const typesettingTabs = screen.getAllByText(/4\. Typesetting/i);
    fireEvent.click(typesettingTabs[0]);

    // Change Global Default Font Size input to 24px
    const defaultFontSizeInput = screen.getByLabelText(/Global Default Font Size/i) as HTMLInputElement;
    expect(defaultFontSizeInput).not.toBeNull();

    fireEvent.change(defaultFontSizeInput, { target: { value: '24' } });
    expect(defaultFontSizeInput.value).toBe('24');

    // Test region created before change retains its existing font size
    const existingRegion: TextRegion = {
      id: 'existing-r1',
      bbox: { x: 10, y: 10, width: 100, height: 50 },
      text: 'Existing',
      confidence: 100,
      isCleaned: false,
      typesetting: {
        fontSize: 16,
      },
    };

    const existingStyle = getEffectiveTypesettingStyle(existingRegion, 'sans-serif', 24);
    expect(existingStyle.fontSize).toBe(16);

    // Test new region without explicit fontSize uses the new global default font size (24)
    const newRegion: TextRegion = {
      id: 'new-r2',
      bbox: { x: 10, y: 100, width: 100, height: 50 },
      text: 'New Region',
      confidence: 100,
      isCleaned: false,
    };

    const newStyle = getEffectiveTypesettingStyle(newRegion, 'sans-serif', 24);
    expect(newStyle.fontSize).toBe(24);
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
});
