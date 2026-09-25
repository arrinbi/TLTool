import type { ManhwaPage, HistoryEntry, TextRegion } from '../types';

/**
 * Pushes a new state snapshot onto the page history stack.
 */
export function pushPageHistory(
  page: ManhwaPage,
  newCleanedUrl: string,
  newRegions: TextRegion[],
  description: string
): ManhwaPage {
  const newHistoryEntry: HistoryEntry = {
    cleanedUrl: newCleanedUrl,
    regions: newRegions.map((r) => ({ ...r })),
    description,
  };

  // Truncate forward redo history if we make a new edit from an earlier state
  const updatedHistory = page.history.slice(0, page.historyIndex + 1);
  updatedHistory.push(newHistoryEntry);

  return {
    ...page,
    cleanedUrl: newCleanedUrl,
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
      regions: page.regions.map((r) => ({ ...r, isCleaned: false })),
      historyIndex: -1,
    };
  }

  const prevEntry = page.history[prevIndex];
  return {
    ...page,
    cleanedUrl: prevEntry.cleanedUrl,
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
    regions: nextEntry.regions.map((r) => ({ ...r })),
    historyIndex: nextIndex,
  };
}
