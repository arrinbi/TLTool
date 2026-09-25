import { describe, it, expect } from 'vitest';
import { pushPageHistory, undoPageHistory, redoPageHistory } from '../history';
import type { ManhwaPage } from '../../types';

describe('History System Unit Tests', () => {
  const basePage: ManhwaPage = {
    id: 'page-1',
    name: 'test.png',
    file: new File([], 'test.png'),
    originalUrl: 'blob:original',
    cleanedUrl: 'blob:original',
    width: 800,
    height: 1200,
    regions: [
      { id: 'r1', bbox: { x: 10, y: 10, width: 50, height: 20 }, text: 'Hello', confidence: 90, isCleaned: false },
    ],
    history: [],
    historyIndex: -1,
    isProcessing: false,
  };

  it('pushes new history entry and updates index', () => {
    const updated = pushPageHistory(basePage, 'blob:cleaned-1', [{ ...basePage.regions[0], isCleaned: true }], 'Clean region 1');

    expect(updated.cleanedUrl).toBe('blob:cleaned-1');
    expect(updated.history.length).toBe(1);
    expect(updated.historyIndex).toBe(0);
    expect(updated.regions[0].isCleaned).toBe(true);
  });

  it('undoes back to pristine original state', () => {
    const step1 = pushPageHistory(basePage, 'blob:cleaned-1', [{ ...basePage.regions[0], isCleaned: true }], 'Clean region 1');
    const undone = undoPageHistory(step1);

    expect(undone.cleanedUrl).toBe('blob:original');
    expect(undone.historyIndex).toBe(-1);
    expect(undone.regions[0].isCleaned).toBe(false);
  });

  it('redoes forward step after undo', () => {
    const step1 = pushPageHistory(basePage, 'blob:cleaned-1', [{ ...basePage.regions[0], isCleaned: true }], 'Clean region 1');
    const undone = undoPageHistory(step1);
    const redone = redoPageHistory(undone);

    expect(redone.cleanedUrl).toBe('blob:cleaned-1');
    expect(redone.historyIndex).toBe(0);
    expect(redone.regions[0].isCleaned).toBe(true);
  });
});
