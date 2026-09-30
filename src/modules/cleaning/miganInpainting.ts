/**
 * Isolated MI-GAN AI Inpainting Engine (Browser ONNX Runtime Web)
 * Modulated Inpainting GAN (MI-GAN) deep learning model for text and object removal.
 */

export interface MIGANSessionOptions {
  modelPath?: string;
  executionProviders?: string[];
}

// Cached ONNX inference session instance for MI-GAN
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let miganSession: any = null;

/**
 * Get or initialize the MI-GAN ONNX Inference Session.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMIGANSession(options?: MIGANSessionOptions): Promise<any> {
  if (miganSession) return miganSession;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  const ort = globalObj?.ort || globalObj?.onnxruntime;

  if (!ort || typeof ort.InferenceSession?.create !== 'function') {
    return null;
  }

  const modelPath = options?.modelPath || '/models/migan.onnx';
  try {
    miganSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: options?.executionProviders || ['wasm', 'webgl'],
    });
    return miganSession;
  } catch {
    return null;
  }
}

/**
 * Reset cached MI-GAN session (useful for testing or reloading models).
 */
export function resetMIGANSession(): void {
  miganSession = null;
}

/**
 * Inpaints masked pixels using MI-GAN deep neural network engine.
 * Accepts image data and pixel-level mask.
 * Requires browser ONNX Runtime Web (`onnxruntime-web`) and a MI-GAN ONNX model file.
 */
export async function inpaintMIGAN(
  imgData: ImageData,
  mask?: Uint8Array,

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionOverride?: any
): Promise<void> {
  const { width, height, data } = imgData;
  if (width <= 0 || height <= 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  const ort = globalObj?.ort || globalObj?.onnxruntime;

  const session = sessionOverride || globalObj?.__miganSession || (await getMIGANSession());

  if (!session || !ort) {
    throw new Error(
      'MI-GAN AI inpainting engine is not available in the current browser runtime. ' +
      'Browser-side MI-GAN inference requires ONNX Runtime Web (onnxruntime-web) and a MI-GAN ONNX model file.'
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

  // ONNX Tensor Preprocessing & Execution
  const numPixels = width * height;
  const imageRgb = new Float32Array(3 * numPixels);
  const maskData = new Float32Array(numPixels);

  // Convert ImageData RGBA -> RGB Float32 [1, 3, H, W]
  for (let i = 0; i < numPixels; i++) {
    imageRgb[i] = data[i * 4] / 255.0; // R
    imageRgb[numPixels + i] = data[i * 4 + 1] / 255.0; // G
    imageRgb[2 * numPixels + i] = data[i * 4 + 2] / 255.0; // B

    if (mask && mask[i]) {
      maskData[i] = 1.0;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TensorClass = ort.Tensor || (globalObj as any).Tensor;
  if (!TensorClass) {
    throw new Error('ONNX Tensor constructor is not available.');
  }

  const imageTensor = new TensorClass('float32', imageRgb, [1, 3, height, width]);
  const maskTensor = new TensorClass('float32', maskData, [1, 1, height, width]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feeds: Record<string, any> = {
    image: imageTensor,
    mask: maskTensor,
  };

  const results = await session.run(feeds);
  const outputTensor = results?.output || (results ? Object.values(results)[0] : null);

  if (outputTensor && outputTensor.data) {
    const outData = outputTensor.data as Float32Array | number[];
    const isScaled255 = Array.from(outData.slice(0, Math.min(100, outData.length))).some((v) => v > 1.0);
    const scale = isScaled255 ? 1 : 255;

    for (let i = 0; i < numPixels; i++) {
      const r = Math.min(255, Math.max(0, Math.round(outData[i] * scale)));
      const g = Math.min(255, Math.max(0, Math.round(outData[numPixels + i] * scale)));
      const b = Math.min(255, Math.max(0, Math.round(outData[2 * numPixels + i] * scale)));

      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
  }
}
