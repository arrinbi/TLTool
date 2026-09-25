import { describe, it, expect, beforeEach } from 'vitest';
import { sampleBorderColor, CLEANING_LIMITATIONS_NOTICE } from '../cleaningService';
import type { BoundingBox } from '../../../types';

describe('Cleaning Engine Unit Tests', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    // Create an in-memory HTML canvas for testing pixel sampling
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    mockCtx = canvas.getContext('2d')!;

    // Fill canvas background with white
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(0, 0, 100, 100);

    // Draw a small red box inside canvas
    mockCtx.fillStyle = '#ff0000';
    mockCtx.fillRect(20, 20, 30, 30);
  });

  it('samples border pixel colors correctly around bounding box', () => {
    // Bounding box at 25, 25, size 20, 20 (inside red square)
    // Border around it will sample red pixels
    const bbox: BoundingBox = { x: 25, y: 25, width: 10, height: 10 };
    const sampled = sampleBorderColor(mockCtx, bbox, 2);

    expect(sampled.r).toBeGreaterThan(200);
    expect(sampled.g).toBeLessThan(50);
    expect(sampled.b).toBeLessThan(50);
    expect(sampled.hex.toLowerCase()).toBe('#ff0000');
  });

  it('samples white background outside red box', () => {
    const bbox: BoundingBox = { x: 70, y: 70, width: 10, height: 10 };
    const sampled = sampleBorderColor(mockCtx, bbox, 2);

    expect(sampled.hex.toLowerCase()).toBe('#ffffff');
  });

  it('exports technical limitations notice with structured guidelines', () => {
    expect(CLEANING_LIMITATIONS_NOTICE.title).toBeDefined();
    expect(CLEANING_LIMITATIONS_NOTICE.items.length).toBeGreaterThan(0);
  });
});
