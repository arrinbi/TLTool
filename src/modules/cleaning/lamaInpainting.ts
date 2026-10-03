/**
 * Isolated LaMa AI Inpainting Engine (Browser ONNX Runtime Web)
 * Large Mask Inpainting (LaMa) deep learning model for text and object removal.
 */

export interface LaMaSessionOptions {
  modelPath?: string;
  executionProviders?: string[];
}

// Cached ONNX inference session instance for LaMa
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lamaSession: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrtModule(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  if (globalObj?.ort || globalObj?.onnxruntime) {
    return globalObj.ort || globalObj.onnxruntime;
  }
  try {
    const ortModule = await import('onnxruntime-web');
    return ortModule.default || ortModule;
  } catch {
    return null;
  }
}

/**
 * Get or initialize the LaMa ONNX Inference Session.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLaMaSession(options?: LaMaSessionOptions): Promise<any> {
  if (lamaSession) return lamaSession;

  const ort = await getOrtModule();

  if (!ort || typeof ort.InferenceSession?.create !== 'function') {
    return null;
  }

  const baseUrl = import.meta.env?.BASE_URL || '/';
  const defaultModelPath = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}models/lama.onnx`;
  const modelPath = options?.modelPath || defaultModelPath;

  try {
    lamaSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: options?.executionProviders || ['wasm', 'webgl'],
    });
    return lamaSession;
  } catch {
    return null;
  }
}

/**
 * Reset cached LaMa session (useful for testing or reloading models).
 */
export function resetLaMaSession(): void {
  lamaSession = null;
}

/**
 * Inpaints masked pixels using LaMa AI deep neural network engine.
 * Accepts image data and pixel-level mask.
 * Requires browser ONNX Runtime Web (`onnxruntime-web`) and a LaMa ONNX model file.
 */
export async function inpaintLaMa(
  imgData: ImageData,
  mask?: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionOverride?: any
): Promise<void> {
  const { width, height, data } = imgData;
  if (width <= 0 || height <= 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  const ort = (await getOrtModule()) || globalObj?.ort || globalObj?.onnxruntime;

  const session = sessionOverride || globalObj?.__lamaSession || (await getLaMaSession());

  if (!session || !ort) {
    throw new Error(
      'LaMa AI inpainting engine is not available in the current browser runtime. ' +
      'Browser-side LaMa inference requires ONNX Runtime Web (onnxruntime-web) and a LaMa ONNX model file.'
    );
  }

  // Check if mask has any positive (non-zero) pixels
  let hasMaskPixels = false;
  if (mask && mask.length === width * height) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        hasMaskPixels = true;
        break;
      }
    }
  }

  // If mask is provided and contains no inpaint pixels, return early without modifying image
  if (mask && !hasMaskPixels) {
    return;
  }

  const numPixels = width * height;

  // Determine tensor type from input specification if available (default float32 for standard LaMa exports)
  let inputType = 'float32';
  if (session?.inputMetadata) {
    const metaKeys = Object.keys(session.inputMetadata);
    if (metaKeys.length > 0 && session.inputMetadata[metaKeys[0]]?.type === 'tensor(uint8)') {
      inputType = 'uint8';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TensorClass = ort.Tensor || (globalObj as any).Tensor;
  if (!TensorClass) {
    throw new Error('ONNX Tensor constructor is not available.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let imageTensor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let maskTensor: any;

  if (inputType === 'uint8') {
    const imageUint8 = new Uint8Array(3 * numPixels);
    const maskUint8 = new Uint8Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
      imageUint8[i] = data[i * 4];
      imageUint8[numPixels + i] = data[i * 4 + 1];
      imageUint8[2 * numPixels + i] = data[i * 4 + 2];
      maskUint8[i] = mask && mask[i] ? 255 : 0;
    }
    imageTensor = new TensorClass('uint8', imageUint8, [1, 3, height, width]);
    maskTensor = new TensorClass('uint8', maskUint8, [1, 1, height, width]);
  } else {
    // Float32 default
    const imageFloat = new Float32Array(3 * numPixels);
    const maskFloat = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
      imageFloat[i] = data[i * 4] / 255.0;
      imageFloat[numPixels + i] = data[i * 4 + 1] / 255.0;
      imageFloat[2 * numPixels + i] = data[i * 4 + 2] / 255.0;
      maskFloat[i] = mask && mask[i] ? 1.0 : 0.0;
    }
    imageTensor = new TensorClass('float32', imageFloat, [1, 3, height, width]);
    maskTensor = new TensorClass('float32', maskFloat, [1, 1, height, width]);
  }

  const inputNames = session.inputNames || ['image', 'mask'];
  const imageKey = inputNames.find((n: string) => n.includes('image') || n.includes('img') || n.includes('0')) || inputNames[0] || 'image';
  const maskKey = inputNames.find((n: string) => n.includes('mask') || n.includes('1')) || inputNames[1] || 'mask';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feeds: Record<string, any> = {
    [imageKey]: imageTensor,
    [maskKey]: maskTensor,
  };

  const results = await session.run(feeds);
  const outputTensor = results?.output || results?.result || results?.output_0 || (results ? Object.values(results)[0] : null);

  if (outputTensor && outputTensor.data) {
    const outData = outputTensor.data as Uint8Array | Float32Array | number[];

    // Detect if output values are normalized float32 [0..1]
    let isNormalizedFloat = false;
    if (outData instanceof Float32Array || typeof outData[0] === 'number') {
      let maxVal = 0;
      for (let i = 0; i < Math.min(outData.length, 100); i++) {
        if (outData[i] > maxVal) maxVal = outData[i];
      }
      if (maxVal <= 1.05) {
        isNormalizedFloat = true;
      }
    }

    for (let i = 0; i < numPixels; i++) {
      let r = outData[i];
      let g = outData[numPixels + i];
      let b = outData[2 * numPixels + i];

      if (isNormalizedFloat) {
        r *= 255.0;
        g *= 255.0;
        b *= 255.0;
      }

      data[i * 4] = Math.min(255, Math.max(0, Math.round(r)));
      data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(g)));
      data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(b)));
      data[i * 4 + 3] = 255;
    }
  }
}
