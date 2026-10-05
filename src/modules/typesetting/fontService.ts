import JSZip from 'jszip';

export interface CustomFont {
  id: string;
  displayName: string;
  fileName: string;
  familyName: string;
  url: string;
  sourceType: 'custom' | 'system';
  fontFace?: FontFace;
}

export interface StoredFontRecord {
  id: string;
  displayName: string;
  fileName: string;
  familyName: string;
  buffer: ArrayBuffer;
  createdAt: number;
}

const DB_NAME = 'TLTool_Fonts_DB';
const STORE_NAME = 'custom_fonts';

const registeredFontsMap = new Map<string, CustomFont>();

/**
 * Gets all currently registered custom fonts.
 */
export function getRegisteredCustomFonts(): CustomFont[] {
  return Array.from(registeredFontsMap.values());
}

function openFontDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveFontToIndexedDB(record: StoredFontRecord): Promise<void> {
  try {
    const db = await openFontDatabase();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to save font to IndexedDB:', err);
  }
}

export async function deleteFontFromIndexedDB(fontId: string): Promise<void> {
  try {
    const db = await openFontDatabase();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(fontId);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to delete font from IndexedDB:', err);
  }
}

export async function loadSavedCustomFonts(): Promise<CustomFont[]> {
  try {
    const db = await openFontDatabase();
    if (!db) return [];
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    const records: StoredFontRecord[] = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const loadedFonts: CustomFont[] = [];
    for (const record of records) {
      if (registeredFontsMap.has(record.id)) {
        loadedFonts.push(registeredFontsMap.get(record.id)!);
        continue;
      }

      let fontFace: FontFace | undefined;
      if (typeof FontFace !== 'undefined') {
        try {
          fontFace = new FontFace(record.familyName, record.buffer);
          await fontFace.load();
          if (typeof document !== 'undefined' && document.fonts) {
            document.fonts.add(fontFace);
          }
        } catch (err) {
          console.warn(`Failed to re-load FontFace for ${record.fileName}:`, err);
        }
      }

      const blob = new Blob([record.buffer], {
        type: record.fileName.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf',
      });
      const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '';

      const customFont: CustomFont = {
        id: record.id,
        displayName: record.displayName,
        fileName: record.fileName,
        familyName: record.familyName,
        url,
        sourceType: 'custom',
        fontFace,
      };

      registeredFontsMap.set(customFont.id, customFont);
      loadedFonts.push(customFont);
    }
    return loadedFonts;
  } catch (err) {
    console.warn('Failed to load saved fonts from IndexedDB:', err);
    return [];
  }
}

/**
 * Clean filename to generate a readable font display name and css family name.
 */
function sanitizeFontName(filename: string): { displayName: string; familyName: string } {
  const baseName = filename.split('/').pop() || filename;
  const cleanName = baseName.replace(/\.(ttf|otf)$/i, '').trim();
  // CSS font-family safe name
  const safeFamily = cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    displayName: cleanName || 'Custom Font',
    familyName: `CustomFont_${safeFamily}_${Math.random().toString(36).substring(2, 6)}`,
  };
}

/**
 * Registers a font buffer or blob in the browser via FontFace API.
 */
export async function registerFontFace(
  displayName: string,
  fileName: string,
  buffer: ArrayBuffer
): Promise<CustomFont> {
  const { familyName } = sanitizeFontName(fileName);

  let fontFace: FontFace | undefined;
  if (typeof FontFace !== 'undefined') {
    try {
      fontFace = new FontFace(familyName, buffer);
      await fontFace.load();
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.add(fontFace);
      }
    } catch (err) {
      console.error(`Failed to register FontFace for ${fileName}:`, err);
      throw new Error('Font could not be loaded');
    }
  }

  const blob = new Blob([buffer], {
    type: fileName.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf',
  });
  const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '';

  const customFont: CustomFont = {
    id: `custom-font-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    displayName,
    fileName,
    familyName,
    url,
    sourceType: 'custom',
    fontFace,
  };

  registeredFontsMap.set(customFont.id, customFont);

  // Persist font to IndexedDB
  saveFontToIndexedDB({
    id: customFont.id,
    displayName,
    fileName,
    familyName,
    buffer,
    createdAt: Date.now(),
  });

  return customFont;
}

/**
 * Unregisters and releases a custom font.
 */
export function unregisterCustomFont(fontId: string): void {
  const font = registeredFontsMap.get(fontId);
  if (!font) return;

  if (font.fontFace && typeof document !== 'undefined' && document.fonts) {
    try {
      document.fonts.delete(font.fontFace);
    } catch (err) {
      console.warn('Failed to delete FontFace from document.fonts:', err);
    }
  }

  if (font.url && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    try {
      URL.revokeObjectURL(font.url);
    } catch {
      // Ignore
    }
  }

  registeredFontsMap.delete(fontId);
  deleteFontFromIndexedDB(fontId);
}

/**
 * Helper to ensure a given font family is fully loaded before canvas rendering.
 */
export async function ensureFontLoaded(fontFamily: string): Promise<void> {
  if (!fontFamily || fontFamily === 'sans-serif') return;
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
    return;
  }

  try {
    await document.fonts.load(`16px ${fontFamily}`);
  } catch (err) {
    console.warn(`Font load wait failed for ${fontFamily}:`, err);
  }
}

export interface UploadFontResult {
  fonts: CustomFont[];
  statusMessage: string;
  error?: boolean;
}

/**
 * Processes an uploaded file (.ttf, .otf, or .zip), extracting and registering all valid fonts.
 */
export async function processFontUpload(
  file: File,
  existingFonts: CustomFont[] = []
): Promise<UploadFontResult> {
  const filename = file.name.toLowerCase();

  // Combine internally registered fonts and component state fonts for deduplication
  const allExisting = [...getRegisteredCustomFonts(), ...existingFonts];
  const isDuplicate = (name: string, fileN: string) =>
    allExisting.some(
      (f) =>
        f.displayName.toLowerCase() === name.toLowerCase() ||
        f.fileName.toLowerCase() === fileN.toLowerCase()
    );

  // 1. Process ZIP Archives
  if (filename.endsWith('.zip')) {
    try {
      const zip = await JSZip.loadAsync(file);
      const fontEntries: { name: string; entry: JSZip.JSZipObject }[] = [];

      zip.forEach((relativePath, entry) => {
        if (!entry.dir) {
          const lower = relativePath.toLowerCase();
          if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
            fontEntries.push({ name: relativePath, entry });
          }
        }
      });

      if (fontEntries.length === 0) {
        return {
          fonts: [],
          statusMessage: 'No font files found in ZIP',
          error: true,
        };
      }

      const newFonts: CustomFont[] = [];
      let duplicateCount = 0;

      for (const { name, entry } of fontEntries) {
        const cleanDisplayName = (name.split('/').pop() || name).replace(/\.(ttf|otf)$/i, '').trim();

        if (isDuplicate(cleanDisplayName, name)) {
          duplicateCount++;
          continue;
        }

        try {
          const buffer = await entry.async('arraybuffer');
          const customFont = await registerFontFace(cleanDisplayName, name, buffer);
          newFonts.push(customFont);
          allExisting.push(customFont);
        } catch (err) {
          console.warn(`Could not parse font ${name} inside ZIP:`, err);
        }
      }

      if (newFonts.length === 0 && duplicateCount > 0) {
        return {
          fonts: [],
          statusMessage: 'Font already added',
        };
      }

      if (newFonts.length === 0) {
        return {
          fonts: [],
          statusMessage: 'Font could not be loaded',
          error: true,
        };
      }

      const fontCount = newFonts.length;
      return {
        fonts: newFonts,
        statusMessage: `${fontCount} ${fontCount === 1 ? 'font' : 'fonts'} found in ZIP`,
      };
    } catch (zipErr) {
      console.error('Failed to parse ZIP file:', zipErr);
      return {
        fonts: [],
        statusMessage: 'Could not read ZIP',
        error: true,
      };
    }
  }

  // 2. Process Standalone .ttf / .otf
  if (filename.endsWith('.ttf') || filename.endsWith('.otf')) {
    const cleanDisplayName = file.name.replace(/\.(ttf|otf)$/i, '').trim();

    if (isDuplicate(cleanDisplayName, file.name)) {
      return {
        fonts: [],
        statusMessage: 'Font already added',
      };
    }

    try {
      const buffer = await file.arrayBuffer();
      const customFont = await registerFontFace(cleanDisplayName, file.name, buffer);
      return {
        fonts: [customFont],
        statusMessage: 'Font loaded',
      };
    } catch (err) {
      console.error('Failed to load standalone font:', err);
      return {
        fonts: [],
        statusMessage: 'Font could not be loaded',
        error: true,
      };
    }
  }

  // 3. Unsupported file type
  return {
    fonts: [],
    statusMessage: 'Unsupported file',
    error: true,
  };
}
