import jsPDF from 'jspdf';
import JSZip from 'jszip';
import type { ManhwaPage } from '../../types';
import { renderTypesetImage } from '../typesetting/typesettingService';

export interface ExportProgress {
  currentPage: number;
  totalPages: number;
  statusMessage: string;
}

/**
 * Generates and downloads a multi-page PDF containing all completed pages
 * using the final typeset rendering (cleaned background + rendered translated text).
 * Preserves page order and original aspect ratios.
 */
export async function exportPagesAsPdf(
  pages: ManhwaPage[],
  defaultFontFamily: string = 'sans-serif',
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  if (!pages || pages.length === 0) {
    throw new Error('No pages available to export.');
  }

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (onProgress) {
      onProgress({
        currentPage: i + 1,
        totalPages: pages.length,
        statusMessage: `Rendering page ${i + 1} of ${pages.length} (${page.name})...`,
      });
    }

    const typesetDataUrl = await renderTypesetImage(
      page.cleanedUrl,
      page.regions,
      defaultFontFamily
    );

    const imgWidth = page.width || 800;
    const imgHeight = page.height || 1200;
    const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';

    if (i === 0) {
      pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [imgWidth, imgHeight],
        compress: true,
      });
    } else if (pdf) {
      pdf.addPage([imgWidth, imgHeight], orientation);
    }

    if (pdf) {
      pdf.addImage(typesetDataUrl, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
    }
  }

  if (pdf) {
    pdf.save('manhwa_translated_export.pdf');
  }
}

/**
 * Generates and downloads a ZIP archive containing all final typeset page images.
 * Preserves original page filenames and rendered translated text without editor overlays.
 */
export async function exportPagesAsZip(
  pages: ManhwaPage[],
  defaultFontFamily: string = 'sans-serif',
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  if (!pages || pages.length === 0) {
    throw new Error('No pages available to export.');
  }

  const zip = new JSZip();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (onProgress) {
      onProgress({
        currentPage: i + 1,
        totalPages: pages.length,
        statusMessage: `Rendering page ${i + 1} of ${pages.length} (${page.name})...`,
      });
    }

    const typesetDataUrl = await renderTypesetImage(
      page.cleanedUrl,
      page.regions,
      defaultFontFamily
    );

    // Convert data URL to binary blob
    const base64Data = typesetDataUrl.split(',')[1];

    // Format page filename nicely (e.g. 01_page.png)
    const pageNumStr = String(i + 1).padStart(2, '0');
    let cleanName = page.name.replace(/\.[^/.]+$/, '');
    if (!cleanName.startsWith(pageNumStr)) {
      cleanName = `${pageNumStr}_${cleanName}`;
    }
    const fileName = `${cleanName}.png`;

    zip.file(fileName, base64Data, { base64: true });
  }

  if (onProgress) {
    onProgress({
      currentPage: pages.length,
      totalPages: pages.length,
      statusMessage: 'Compressing ZIP archive...',
    });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(zipBlob);

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = 'manhwa_translated_pages.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
