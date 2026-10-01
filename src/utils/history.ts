import type { ManhwaPage, HistoryEntry, TextRegion } from '../types';

/**
 * Pushes a new state snapshot onto the page history stack.
 */
export function pushPageHistory(
  page: ManhwaPage,
  newCleanedUrl: string,
  newRegions: TextRegion[],
  description: string,
  extra?: {
    croppedUrl?: string;
    width?: number;
    height?: number;
  }
): ManhwaPage {
  const currentCroppedUrl = extra?.croppedUrl ?? page.croppedUrl;
  const currentWidth = extra?.width ?? page.width;
  const currentHeight = extra?.height ?? page.height;

  const newHistoryEntry: HistoryEntry = {
    cleanedUrl: newCleanedUrl,
    croppedUrl: currentCroppedUrl,
    width: currentWidth,
    height: currentHeight,
    regions: newRegions.map((r) => ({ ...r })),
    description,
  };

  // Truncate forward redo history if we make a new edit from an earlier state
  const updatedHistory = page.history.slice(0, page.historyIndex + 1);
  updatedHistory.push(newHistoryEntry);

  return {
    ...page,
    cleanedUrl: newCleanedUrl,
    croppedUrl: currentCroppedUrl,
    width: currentWidth,
    height: currentHeight,
    originalWidth: page.originalWidth ?? page.width,
    originalHeight: page.originalHeight ?? page.height,
    regions: newRegions,
    history: updatedHistory,
    historyIndex: updatedHistory.length - 1,
  };
}

/**
 * Perform Undo action on page history stack.
 */
export function undoPageHistory(page: ManhwaPage): ManhwaPage {
  if (page.historyIndex < 0) return page; // Already at pristine original state

  const prevIndex = page.historyIndex - 1;

  if (prevIndex < 0) {
    // Revert back to base pristine original state
    return {
      ...page,
      cleanedUrl: page.originalUrl,
      croppedUrl: undefined,
      width: page.originalWidth ?? page.width,
      height: page.originalHeight ?? page.height,
      regions: page.regions.map((r) => ({ ...r, isCleaned: false })),
      historyIndex: -1,
    };
  }

  const prevEntry = page.history[prevIndex];
  return {
    ...page,
    cleanedUrl: prevEntry.cleanedUrl,
    croppedUrl: prevEntry.croppedUrl,
    width: prevEntry.width ?? page.width,
    height: prevEntry.height ?? page.height,
    regions: prevEntry.regions.map((r) => ({ ...r })),
    historyIndex: prevIndex,
  };
}

/**
 * Perform Redo action on page history stack.
 */
export function redoPageHistory(page: ManhwaPage): ManhwaPage {
  if (page.historyIndex >= page.history.length - 1) return page;

  const nextIndex = page.historyIndex + 1;
  const nextEntry = page.history[nextIndex];

  return {
    ...page,
    cleanedUrl: nextEntry.cleanedUrl,
    croppedUrl: nextEntry.croppedUrl,
    width: nextEntry.width ?? page.width,
    height: nextEntry.height ?? page.height,
    regions: nextEntry.regions.map((r) => ({ ...r })),
    historyIndex: nextIndex,
  };
}
