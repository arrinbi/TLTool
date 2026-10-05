import { describe, it, expect } from 'vitest';
import { generateTextMask, analyzePatchBackground } from '../cleaningService';

describe('Speech Bubble Cleaning Fix Verification & Repeated Cleaning Idempotence', () => {
  it('detects uniform speech bubble background correctly and samples pure white color', () => {
    // 100x100 patch simulating white speech bubble with dark text in center
    const patchData = new ImageData(100, 100);
    // Fill white background
    for (let i = 0; i < patchData.data.length; i += 4) {
      patchData.data[i] = 255;
      patchData.data[i + 1] = 255;
      patchData.data[i + 2] = 255;
      patchData.data[i + 3] = 255;
    }

    // Add dark text in center x=30..70, y=30..70
    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = (y * 100 + x) * 4;
        patchData.data[idx] = 16;
        patchData.data[idx + 1] = 16;
        patchData.data[idx + 2] = 16;
      }
    }

    const maskResult = generateTextMask(patchData);
    expect(maskResult.isUniformBackground).toBe(true);
    expect(maskResult.avgBgColor.r).toBe(255);
    expect(maskResult.avgBgColor.g).toBe(255);
    expect(maskResult.avgBgColor.b).toBe(255);
  });

  it('preserves uniform background state when analyzing patch background on manual selection', () => {
    const patchData = new ImageData(100, 100);
    for (let i = 0; i < patchData.data.length; i += 4) {
      patchData.data[i] = 255;
      patchData.data[i + 1] = 255;
      patchData.data[i + 2] = 255;
      patchData.data[i + 3] = 255;
    }

    // Dark text inside inner 60x60 area
    for (let y = 20; y < 80; y++) {
      for (let x = 20; x < 80; x++) {
        const idx = (y * 100 + x) * 4;
        patchData.data[idx] = 20;
        patchData.data[idx + 1] = 20;
        patchData.data[idx + 2] = 20;
      }
    }

    // targetMask = 1 inside 60x60 area
    const targetMask = new Uint8Array(100 * 100);
    for (let y = 20; y < 80; y++) {
      for (let x = 20; x < 80; x++) {
        targetMask[y * 100 + x] = 1;
      }
    }

    const analysis = analyzePatchBackground(patchData, targetMask);
    expect(analysis.isUniform).toBe(true);
    expect(analysis.avgColor.r).toBe(255);
    expect(analysis.avgColor.g).toBe(255);
    expect(analysis.avgColor.b).toBe(255);
  });
});
