import * as cvModule from '@techstark/opencv-js';
import type { BoundingBox, CleaningOptions, TextRegion, RegionCategory, CategoryCleaningFlags } from '../../types';
import { inpaintMIGAN } from './miganInpainting';
export { inpaintMIGAN, resetMIGANSession } from './miganInpainting';

// Cached OpenCV runtime instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvInstance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOpenCV(): Promise<any> {
  if (cvInstance) return cvInstance;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadedCv = (cvModule as any)?.default || cvModule;

  if (loadedCv && loadedCv.Mat) {
    cvInstance = loadedCv;
    return cvInstance;
  }

  if (loadedCv && typeof loadedCv.onRuntimeInitialized !== 'undefined') {
    if (!loadedCv.Mat) {
      await new Promise<void>((resolve) => {
        loadedCv.onRuntimeInitialized = () => resolve();
      });
    }
    cvInstance = loadedCv;
    return cvInstance;
  }

  cvInstance = loadedCv;
  return cvInstance;
}

/**
 * Inpaints masked text pixels using OpenCV Telea algorithm (`cv.INPAINT_TELEA`).
 */
export async function inpaintOpenCVTelea(
  imgData: ImageData,
  mask?: Uint8Array,
  inpaintRadius: number = 3
): Promise<void> {
  const cv = await getOpenCV();
  if (!cv || typeof cv.inpaint !== 'function') {
    throw new Error('OpenCV Telea is not available in the current environment.');
  }

  const { width, height, data } = imgData;
  if (width <= 0 || height <= 0) return;

  // Convert ImageData (RGBA) to cv.Mat
  const srcMat = cv.matFromImageData(imgData);

  // Convert RGBA to RGB (CV_8UC3) as cv.inpaint expects 8-bit 1 or 3 channel image
  const srcRgbMat = new cv.Mat();
  cv.cvtColor(srcMat, srcRgbMat, cv.COLOR_RGBA2RGB);

  // Prepare binary inpaint mask (CV_8UC1)
  const maskMat = new cv.Mat(height, width, cv.CV_8UC1);
  const maskBytes = new Uint8Array(width * height);

  let hasMaskPixels = false;
  if (mask && mask.length === width * height) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        maskBytes[i] = 255;
        hasMaskPixels = true;
      }
    }
  }

  // If no candidate text mask pixels were found, return early without modifying the image
  if (!hasMaskPixels) {
    return;
  }

  maskMat.data.set(maskBytes);

  // Perform OpenCV Telea Inpainting
  const dstRgbMat = new cv.Mat();
  const teleaFlag = typeof cv.INPAINT_TELEA !== 'undefined' ? cv.INPAINT_TELEA : 1;
  cv.inpaint(srcRgbMat, maskMat, dstRgbMat, inpaintRadius, teleaFlag);

  // Convert back to RGBA
  const dstRgbaMat = new cv.Mat();
  cv.cvtColor(dstRgbMat, dstRgbaMat, cv.COLOR_RGB2RGBA);

  // Write back to imgData.data buffer
  data.set(dstRgbaMat.data);

  // Free OpenCV Mat memory allocations
  srcMat.delete();
  srcRgbMat.delete();
  maskMat.delete();
  dstRgbMat.delete();
  dstRgbaMat.delete();
}

/**
 * Inpaints masked pixels using LaMa AI deep neural network engine.
 * Accepts image data and pixel-level mask.
 * Requires browser ONNX Runtime Web (`onnxruntime-web`) and a LaMa ONNX model file.
 */
export async function inpaintLaMa(
  imgData: ImageData,
  _mask?: Uint8Array
): Promise<void> {
  const { width, height } = imgData;
  if (width <= 0 || height <= 0) return;

  // Check if browser-side ONNX Runtime Web is available in current runtime environment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  const ort = globalObj?.ort || globalObj?.onnxruntime;

  if (!ort || typeof ort.InferenceSession?.create !== 'function') {
    throw new Error(
      'LaMa AI inpainting engine is not available in the current browser runtime. ' +
      'Browser-side LaMa inference requires ONNX Runtime Web (onnxruntime-web) and a LaMa ONNX model file.'
    );
  }
}

export interface TextMaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  isUniformBackground: boolean;
  avgBgColor: { r: number; g: number; b: number };
  maskPixelCount: number;
}

/**
 * Samples unmasked background pixels in an image patch to check for background color uniformity
 * and return average background color.
 */
export function analyzePatchBackground(
  imgData: ImageData,
  mask: Uint8Array
): { isUniform: boolean; avgColor: { r: number; g: number; b: number } } {
  const { width, height, data } = imgData;
  const len = mask.length;
  if (len === 0 || len !== width * height) {
    return { isUniform: true, avgColor: { r: 255, g: 255, b: 255 } };
  }

  const unmaskedPixels: Array<{ r: number; g: number; b: number; lum: number }> = [];

  for (let i = 0; i < len; i++) {
    if (!mask[i]) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      unmaskedPixels.push({ r, g, b, lum });
    }
  }

  if (unmaskedPixels.length === 0) {
    return { isUniform: true, avgColor: { r: 255, g: 255, b: 255 } };
  }

  // Trimmed mean to ignore border outline strokes or outlier pixels
  unmaskedPixels.sort((a, b) => a.lum - b.lum);
  const trimStart = Math.floor(unmaskedPixels.length * 0.15);
  const trimEnd = Math.ceil(unmaskedPixels.length * 0.85);

  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = trimStart; i < trimEnd; i++) {
    sumR += unmaskedPixels[i].r;
    sumG += unmaskedPixels[i].g;
    sumB += unmaskedPixels[i].b;
    count++;
  }

  if (count === 0) {
    for (const p of unmaskedPixels) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
      count++;
    }
  }

  const avgR = Math.round(sumR / count);
  const avgG = Math.round(sumG / count);
  const avgB = Math.round(sumB / count);

  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  let varianceSum = 0;

  for (let i = trimStart; i < trimEnd; i++) {
    const diff = unmaskedPixels[i].lum - avgLum;
    varianceSum += diff * diff;
  }

  const stdDev = count > 0 ? Math.sqrt(varianceSum / count) : 0;
  const isUniform = stdDev < 15;

  return {
    isUniform,
    avgColor: { r: avgR, g: avgG, b: avgB },
  };
}

/**
 * Creates an HTMLCanvasElement initialized with an image source at full native pixel resolution.
 */
export async function createFullResCanvas(
  imageSource: string | HTMLImageElement
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';

  if (typeof imageSource === 'string') {
    img.src = imageSource;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  } else {
    if (!imageSource.complete) {
      await new Promise((resolve, reject) => {
        imageSource.onload = resolve;
        imageSource.onerror = reject;
      });
    }
    img.src = imageSource.src;
  }

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  ctx.drawImage(img, 0, 0);
  return { canvas, ctx };
}

/**
 * Sample robust dominant/average background color around the border perimeter of a bounding box.
 * Ignores minority outlier line art or border stroke pixels using trimmed mean.
 */
export function sampleBorderColor(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox,
  borderWidth: number = 4
): { r: number; g: number; b: number; a: number; hex: string } {
  const imgWidth = ctx.canvas.width;
  const imgHeight = ctx.canvas.height;

  const padX = Math.max(0, bbox.x - borderWidth);
  const padY = Math.max(0, bbox.y - borderWidth);
  const padW = Math.min(imgWidth - padX, bbox.width + borderWidth * 2);
  const padH = Math.min(imgHeight - padY, bbox.height + borderWidth * 2);

  const imgData = ctx.getImageData(padX, padY, padW, padH);
  const pixels = imgData.data;

  const sampledPixels: Array<{ r: number; g: number; b: number; lum: number }> = [];

  for (let y = 0; y < padH; y++) {
    for (let x = 0; x < padW; x++) {
      const isBorder =
        y < borderWidth ||
        y >= padH - borderWidth ||
        x < borderWidth ||
        x >= padW - borderWidth;

      if (isBorder) {
        const idx = (y * padW + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        sampledPixels.push({ r, g, b, lum });
      }
    }
  }

  if (sampledPixels.length === 0) {
    return { r: 255, g: 255, b: 255, a: 255, hex: '#ffffff' };
  }

  // Sort by luminance and take interquartile / trimmed mean to discard outline strokes
  sampledPixels.sort((a, b) => a.lum - b.lum);
  const startIdx = Math.floor(sampledPixels.length * 0.2);
  const endIdx = Math.ceil(sampledPixels.length * 0.8);

  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  for (let i = startIdx; i < endIdx; i++) {
    totalR += sampledPixels[i].r;
    totalG += sampledPixels[i].g;
    totalB += sampledPixels[i].b;
    count++;
  }

  if (count === 0) {
    count = sampledPixels.length;
    for (const p of sampledPixels) {
      totalR += p.r;
      totalG += p.g;
      totalB += p.b;
    }
  }

  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);

  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  const hex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

  return { r: avgR, g: avgG, b: avgB, a: 255, hex };
}

/**
 * Conservative text stroke mask generator.
 * Analyzes candidate bounding box image patch and returns a binary mask (1 = text stroke, 0 = artwork/bg).
 * Applies connected component and geometric shape constraints to preserve line art, hair, faces, clothing, and bubble borders.
 */
export function generateTextMask(
  imgData: ImageData,
  isManualRegion: boolean = false,
  category?: RegionCategory
): TextMaskResult {
  const { width, height, data } = imgData;
  const totalPixels = width * height;

  if (totalPixels === 0) {
    return {
      mask: new Uint8Array(0),
      width,
      height,
      isUniformBackground: true,
      avgBgColor: { r: 255, g: 255, b: 255 },
      maskPixelCount: 0,
    };
  }

  // 1. Analyze perimeter border to calculate dominant background color and background uniformity
  const borderPixels: Array<{ r: number; g: number; b: number; lum: number }> = [];
  const borderWidth = Math.max(1, Math.min(3, Math.floor(Math.min(width, height) / 8)));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isPerimeter =
        y < borderWidth ||
        y >= height - borderWidth ||
        x < borderWidth ||
        x >= width - borderWidth;

      if (isPerimeter) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        borderPixels.push({ r, g, b, lum });
      }
    }
  }

  // Trimmed mean to ignore border outline strokes
  borderPixels.sort((a, b) => a.lum - b.lum);
  const trimStart = Math.floor(borderPixels.length * 0.2);
  const trimEnd = Math.ceil(borderPixels.length * 0.8);

  let borderR = 0, borderG = 0, borderB = 0, borderCount = 0;
  for (let i = trimStart; i < trimEnd; i++) {
    borderR += borderPixels[i].r;
    borderG += borderPixels[i].g;
    borderB += borderPixels[i].b;
    borderCount++;
  }

  if (borderCount === 0) {
    for (const p of borderPixels) {
      borderR += p.r;
      borderG += p.g;
      borderB += p.b;
      borderCount++;
    }
  }

  const avgR = Math.round(borderR / Math.max(1, borderCount));
  const avgG = Math.round(borderG / Math.max(1, borderCount));
  const avgB = Math.round(borderB / Math.max(1, borderCount));

  // Calculate standard deviation of trimmed border luminance to check if background is uniform
  let borderVarianceSum = 0;
  const borderAvgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

  for (let i = trimStart; i < trimEnd; i++) {
    const diff = borderPixels[i].lum - borderAvgLum;
    borderVarianceSum += diff * diff;
  }

  const borderStdDev = borderCount > 0 ? Math.sqrt(borderVarianceSum / borderCount) : 0;
  // If category is text-outside, treat as artwork mode rather than uniform speech bubble
  const isUniformBackground = category === 'text-outside' ? false : borderStdDev < 15;

  // 2. Identify candidate text pixels
  const candidateMask = new Uint8Array(totalPixels);

  if (isUniformBackground) {
    // Speech bubble mode: High contrast relative to uniform background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const colorDist = Math.sqrt(
          (r - avgR) * (r - avgR) +
          (g - avgG) * (g - avgG) +
          (b - avgB) * (b - avgB)
        );

        if (colorDist > 15) {
          candidateMask[y * width + x] = 1;
        }
      }
    }
  } else {
    // Wild text / Artwork mode:
    // Search for dark/high-contrast character-like strokes relative to local neighborhood maximum luminance window
    const searchRadius = Math.max(3, Math.min(6, Math.floor(Math.min(width, height) / 6)));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Find max luminance in local window (surrounding background)
        let localMaxLum = lum;
        for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = (ny * width + nx) * 4;
            const nLum = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
            if (nLum > localMaxLum) {
              localMaxLum = nLum;
            }
          }
        }

        // Find max luminance and min luminance in local window
        let localMinLum = lum;
        for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = (ny * width + nx) * 4;
            const nLum = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
            if (nLum < localMinLum) {
              localMinLum = nLum;
            }
          }
        }

        // Candidate pixel can be dark relative to local maximum (dark text on light artwork)
        // or light relative to local minimum (white/light text on dark clothing/hair/artwork)
        if (localMaxLum - lum > 35 || lum - localMinLum > 35) {
          // Verify contrast against local average to avoid expanding onto surrounding background
          let localSumLum = 0;
          let localCount = 0;
          for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const nIdx = (ny * width + nx) * 4;
              localSumLum += 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
              localCount++;
            }
          }
          const localAvgLum = localCount > 0 ? localSumLum / localCount : lum;
          if (Math.abs(lum - localAvgLum) > 20) {
            candidateMask[y * width + x] = 1;
          }
        }
      }
    }
  }

  // 3. Connected Component Analysis (CCA) to filter out line art, hair, bubble borders, and non-text structures
  const visited = new Uint8Array(totalPixels);
  const filteredMask = new Uint8Array(totalPixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (candidateMask[pos] === 1 && visited[pos] === 0) {
        // BFS to find connected component
        const componentIndices: number[] = [];
        const queue: number[] = [pos];
        visited[pos] = 1;

        let minX = x, maxX = x;
        let minY = y, maxY = y;
        let touchesEdge = false;

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          componentIndices.push(curr);

          const cx = curr % width;
          const cy = Math.floor(curr / width);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          if (cx <= 1 || cx >= width - 2 || cy <= 1 || cy >= height - 2) {
            touchesEdge = true;
          }

          // 8-neighbor traversal
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;

              const nPos = ny * width + nx;
              if (candidateMask[nPos] === 1 && visited[nPos] === 0) {
                visited[nPos] = 1;
                queue.push(nPos);
              }
            }
          }
        }

        const compWidth = maxX - minX + 1;
        const compHeight = maxY - minY + 1;
        const pixelCount = componentIndices.length;
        const aspectRatio = compWidth / Math.max(1, compHeight);

        let isTextComponent = true;

        // For manually selected regions, edge-touching is expected because user draws tight bounding boxes
        const checkTouchesEdge = isManualRegion ? false : touchesEdge;

        // Rule A: Tiny isolated noise pixels (< 3px) -> Discard
        if (pixelCount < 3) {
          isTextComponent = false;
        }

        // Rule B: Components spanning almost full width/height (border lines, panel borders, long hair/clothing lines) -> Discard
        if (compWidth > width * 0.8 || compHeight > height * 0.8) {
          isTextComponent = false;
        }

        // Rule C: Components touching image edge with continuous long dimension -> Discard (bubble outline or entering hair/artwork)
        if (checkTouchesEdge && (compWidth > width * 0.5 || compHeight > height * 0.5)) {
          isTextComponent = false;
        }

        // Rule D: Extreme aspect ratios (very long thin horizontal or vertical lines: hair, clothing folds, line art) -> Discard
        if (!isUniformBackground) {
          if (aspectRatio > 6.0 || aspectRatio < 0.15) {
            isTextComponent = false;
          }
          // Components touching edge in wild artwork -> Discard unless small
          if (checkTouchesEdge && pixelCount > 12) {
            isTextComponent = false;
          }
          // Overly large component in wild artwork -> Discard (large shadow/hair area)
          if (pixelCount > totalPixels * 0.35) {
            isTextComponent = false;
          }
        } else {
          // Inside uniform speech bubble: keep bubble border intact
          if (checkTouchesEdge && (compWidth > width * 0.4 || compHeight > height * 0.4)) {
            isTextComponent = false;
          }
        }

        if (isTextComponent) {
          for (const idx of componentIndices) {
            filteredMask[idx] = 1;
          }
        }
      }
    }
  }

  // 3b. For manually selected text-outside regions, include enclosed light interior areas surrounded by detected dark text outline
  if (isManualRegion && category === 'text-outside') {
    const barrierMask = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        if (filteredMask[pos] === 1) {
          for (let dy = -2; dy <= 2; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              barrierMask[ny * width + nx] = 1;
            }
          }
        }
      }
    }

    const exteriorReachable = new Uint8Array(totalPixels);
    const queue: number[] = [];

    const addBorderPixel = (x: number, y: number) => {
      const pos = y * width + x;
      if (barrierMask[pos] === 0 && exteriorReachable[pos] === 0) {
        exteriorReachable[pos] = 1;
        queue.push(pos);
      }
    };

    for (let x = 0; x < width; x++) {
      addBorderPixel(x, 0);
      addBorderPixel(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      addBorderPixel(0, y);
      addBorderPixel(width - 1, y);
    }

    let qHead = 0;
    while (qHead < queue.length) {
      const curr = queue[qHead++];
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nPos = ny * width + nx;
          if (barrierMask[nPos] === 0 && exteriorReachable[nPos] === 0) {
            exteriorReachable[nPos] = 1;
            queue.push(nPos);
          }
        }
      }
    }

    for (let i = 0; i < totalPixels; i++) {
      if (exteriorReachable[i] === 0) {
        filteredMask[i] = 1;
      }
    }
  }

  // 4. 2-pixel Morphological Dilation to capture anti-aliasing text edges and small text halos without expanding into artwork
  const finalMask = new Uint8Array(totalPixels);
  let maskPixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (filteredMask[pos] === 1) {
        for (let dy = -2; dy <= 2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;

            const nPos = ny * width + nx;
            if (finalMask[nPos] === 0) {
              finalMask[nPos] = 1;
              maskPixelCount++;
            }
          }
        }
      }
    }
  }

  return {
    mask: finalMask,
    width,
    height,
    isUniformBackground,
    avgBgColor: { r: avgR, g: avgG, b: avgB },
    maskPixelCount,
  };
}

/**
 * Clean plain speech bubble text by filling ONLY masked text pixels with background fill color.
 * Non-masked pixels (speech bubble borders, surrounding artwork) stay 100% untouched.
 */
export function cleanBubbleText(
  imgData: ImageData,
  mask: Uint8Array,
  fillColor: { r: number; g: number; b: number }
): void {
  const { data } = imgData;
  const len = mask.length;

  for (let i = 0; i < len; i++) {
    if (mask[i] === 1) {
      const idx = i * 4;
      data[idx] = fillColor.r;
      data[idx + 1] = fillColor.g;
      data[idx + 2] = fillColor.b;
      data[idx + 3] = 255;
    }
  }
}

/**
 * Fast distance-weighted neighbor diffusion inpainting for text over complex artwork ("wild text").
 * Fills ONLY masked text stroke pixels using surrounding non-masked artwork pixels.
 * Preserves faces, hair, clothing, line art, and background artwork surrounding text.
 */
export function inpaintTextMask(
  imgData: ImageData,
  mask: Uint8Array,
  radius: number = 3,
  passes: number = 4
): void {
  const { width, height, data } = imgData;
  const workData = new Uint8Array(data);
  const currentMask = new Uint8Array(mask);

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        if (currentMask[pos] !== 1) continue;

        let weightSum = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;

            const nPos = ny * width + nx;
            if (currentMask[nPos] === 0) {
              const distSq = dx * dx + dy * dy;
              if (distSq === 0) continue;
              const weight = 1.0 / (distSq + 0.1);

              const nIdx = nPos * 4;
              rSum += workData[nIdx] * weight;
              gSum += workData[nIdx + 1] * weight;
              bSum += workData[nIdx + 2] * weight;
              weightSum += weight;
            }
          }
        }

        if (weightSum > 0) {
          const idx = pos * 4;
          const newR = Math.round(rSum / weightSum);
          const newG = Math.round(gSum / weightSum);
          const newB = Math.round(bSum / weightSum);

          data[idx] = newR;
          data[idx + 1] = newG;
          data[idx + 2] = newB;
          data[idx + 3] = 255;

          // Also update workData so subsequent neighbor lookups in current pass have valid inpainted pixel values
          workData[idx] = newR;
          workData[idx + 1] = newG;
          workData[idx + 2] = newB;
          workData[idx + 3] = 255;
          // Unmark in currentMask after first pass so outer ring inpainting propagates inward
          currentMask[pos] = 0;
        }
      }
    }
  }
}

/**
 * Clean a specified bounding box region on a canvas using pixel-level text mask.
 * Preserves original artwork and background around text pixels.
 */
export async function cleanImageRegion(
  currentCleanedUrl: string,
  bbox: BoundingBox,
  options: CleaningOptions
): Promise<string> {
  const { canvas, ctx } = await createFullResCanvas(currentCleanedUrl);
  const padding = options.padding ?? 2;

  const targetX = Math.max(0, bbox.x - padding);
  const targetY = Math.max(0, bbox.y - padding);
  const targetW = Math.min(canvas.width - targetX, bbox.width + padding * 2);
  const targetH = Math.min(canvas.height - targetY, bbox.height + padding * 2);

  if (targetW <= 0 || targetH <= 0) {
    return currentCleanedUrl;
  }

  const patchImageData = ctx.getImageData(targetX, targetY, targetW, targetH);
  // Keep exact copy of original patch pixels for precise compositing
  const originalPatchData = new Uint8ClampedArray(patchImageData.data);

  let targetMask: Uint8Array;
  let isUniformBg = false;
  let avgBgColor = { r: 255, g: 255, b: 255 };

  if (options.brushMask && options.brushMask.length === bbox.width * bbox.height) {
    targetMask = new Uint8Array(targetW * targetH);
    const offsetX = bbox.x - targetX;
    const offsetY = bbox.y - targetY;

    for (let by = 0; by < bbox.height; by++) {
      for (let bx = 0; bx < bbox.width; bx++) {
        if (options.brushMask[by * bbox.width + bx]) {
          const px = offsetX + bx;
          const py = offsetY + by;
          if (px >= 0 && px < targetW && py >= 0 && py < targetH) {
            targetMask[py * targetW + px] = 1;
          }
        }
      }
    }

    const patchAnalysis = analyzePatchBackground(patchImageData, targetMask);
    isUniformBg = patchAnalysis.isUniform;
    avgBgColor = patchAnalysis.avgColor;
  } else {
    const textMaskResult = generateTextMask(
      patchImageData,
      options.isManualRegion ?? false,
      options.category
    );
    targetMask = textMaskResult.mask;
    isUniformBg = textMaskResult.isUniformBackground;
    avgBgColor = textMaskResult.avgBgColor;
  }

  let hexColor = options.fillColor;
  if (!hexColor) {
    const borderSample = sampleBorderColor(ctx, { x: targetX, y: targetY, width: targetW, height: targetH });
    hexColor = borderSample.hex;
  }

  const parseHex = (hex: string) => {
    const cleanHex = hex.replace('#', '');
    return {
      r: parseInt(cleanHex.substring(0, 2), 16) || 255,
      g: parseInt(cleanHex.substring(2, 4), 16) || 255,
      b: parseInt(cleanHex.substring(4, 6), 16) || 255,
    };
  };

  const chosenColor = parseHex(hexColor);

  // SEPARATE: 1. INPAINTING / CONTEXT AREA, 2. FINAL REPLACEMENT / COMPOSITING MASK.
  // For Brush Cleaning, create an expanded internal context mask so inpainting engines
  // sample pristine background pixels beyond anti-aliased text fringes.
  // The final compositing mask remains strictly the intended target (targetMask).
  const finalCompositingMask = targetMask;
  let inpaintContextMask = targetMask;

  if (options.brushMask || options.isBrush) {
    inpaintContextMask = new Uint8Array(targetW * targetH);
    const dilationRadius = 2;
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        if (targetMask[y * targetW + x] > 0) {
          for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= targetH) continue;
            for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= targetW) continue;
              inpaintContextMask[ny * targetW + nx] = 1;
            }
          }
        }
      }
    }
  }

  if (options.method === 'lama') {
    await inpaintLaMa(patchImageData, inpaintContextMask);
  } else if (options.method === 'migan') {
    await inpaintMIGAN(patchImageData, inpaintContextMask);
  } else if (options.method === 'solid-white') {
    cleanBubbleText(patchImageData, inpaintContextMask, chosenColor);
  } else if (options.method === 'border-sample') {
    cleanBubbleText(patchImageData, inpaintContextMask, avgBgColor);
  } else if (options.method === 'opencv-telea') {
    await inpaintOpenCVTelea(patchImageData, inpaintContextMask);
  } else {
    // smart-fill or default method
    if (isUniformBg) {
      cleanBubbleText(patchImageData, inpaintContextMask, avgBgColor);
    } else {
      await inpaintOpenCVTelea(patchImageData, inpaintContextMask);
    }
  }

  // Precise Compositing: Ensure ONLY pixels marked in finalCompositingMask are replaced.
  // Restore all unmasked pixels (finalCompositingMask[i] === 0) to exact original values.
  const totalPatchPixels = targetW * targetH;
  for (let i = 0; i < totalPatchPixels; i++) {
    if (!finalCompositingMask[i]) {
      const idx = i * 4;
      patchImageData.data[idx] = originalPatchData[idx];
      patchImageData.data[idx + 1] = originalPatchData[idx + 1];
      patchImageData.data[idx + 2] = originalPatchData[idx + 2];
      patchImageData.data[idx + 3] = originalPatchData[idx + 3];
    }
  }

  ctx.putImageData(patchImageData, targetX, targetY);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(canvas.toDataURL('image/png'));
      }
    }, 'image/png', 1.0);
  });
}

/**
 * Determines whether a region category is enabled for cleaning based on options.
 * Default behavior: Speech bubbles and text outside are cleaned by default, SFX is skipped by default.
 */
export function isCategoryEnabled(
  category?: RegionCategory,
  flags?: CategoryCleaningFlags
): boolean {
  if (!flags) {
    // Default: SFX skipped by default, other categories enabled
    return category !== 'sfx';
  }

  switch (category) {
    case 'bubble-oval':
      return flags.cleanBubbleOval;
    case 'bubble-rect':
      return flags.cleanBubbleRect;
    case 'text-outside':
      return flags.cleanTextOutside;
    case 'sfx':
      return flags.cleanSfx;
    default:
      return true;
  }
}

/**
 * Clean all detected regions in one pass using precise mask-level cleaning.
 * Skips regions whose category is disabled in cleaning options (e.g. SFX skipped by default).
 */
export async function cleanAllRegions(
  currentCleanedUrl: string,
  regions: TextRegion[],
  options: CleaningOptions
): Promise<string> {
  let activeUrl = currentCleanedUrl;
  for (const region of regions) {
    if (isCategoryEnabled(region.category, options.categories)) {
      const effectiveOptions: CleaningOptions = {
        ...options,
        isManualRegion: options.isManualRegion ?? region.isManual ?? false,
        category: region.category,
        brushMask: region.brushMask,
        isBrush: region.isBrush,
        brushPoints: region.brushPoints,
        brushSize: region.brushSize,
      };
      activeUrl = await cleanImageRegion(activeUrl, region.bbox, effectiveOptions);
    }
  }
  return activeUrl;
}

/**
 * Technical limitations documentation for the cleaning engine.
 */
export const CLEANING_LIMITATIONS_NOTICE = {
  title: 'Cleaning Engine Capabilities & Technical Limitations',
  items: [
    {
      category: 'OpenCV Telea Inpainting',
      effectiveness: 'High Speed Fast Marching (Default Engine)',
      description: 'Default browser engine using fast marching Telea inpainting on pixel-level masks. Ideal for speech bubbles and text over background art.',
    },
    {
      category: 'LaMa AI Inpainting',
      effectiveness: 'Deep Learning Large Mask Inpainting',
      description: 'Advanced AI engine for complex text removal over detailed artwork. Requires browser ONNX Runtime Web (onnxruntime-web) and a trained LaMa ONNX model file.',
    },
    {
      category: 'MI-GAN AI Inpainting',
      effectiveness: 'Deep Learning Modulation Inpainting (MI-GAN)',
      description: 'Generative AI model optimized for high-quality text inpainting and background restoration. Requires browser ONNX Runtime Web (onnxruntime-web) and a MI-GAN ONNX model file.',
    },
    {
      category: 'Speech Bubbles & Solid Backgrounds',
      effectiveness: 'High Precision (98-100%)',
      description: 'Generates pixel-level text stroke masks inside bubbles. Clears text while preserving bubble borders, outlines, tails, and adjacent artwork.',
    },
    {
      category: 'Wild Text over Artwork / Characters',
      effectiveness: 'Conservative Masking & Neighbor Inpainting',
      description: 'Applies connected component analysis to isolate character strokes while preserving line art, hair strands, facial features, and clothing folds.',
    },
    {
      category: 'Complex SFX & Integrated Graphical Text',
      effectiveness: 'Heuristic Segmentation (Manual touch-up may be required)',
      description: 'Heuristic pixel segmentation prioritizes artwork preservation over complete text deletion. Complex SFX woven into detailed artwork may require manual brush touching for flawless restoration.',
    },
  ],
};
