import '@testing-library/jest-dom';

if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height || 0;
      }
    }
  }
  (globalThis as any).ImageData = MockImageData;
}

if (typeof globalThis.URL.createObjectURL === 'undefined') {
  globalThis.URL.createObjectURL = (_blob: Blob) => 'blob:http://localhost/mock-blob-url';
}

if (typeof globalThis.Image !== 'undefined') {
  Object.defineProperty(globalThis.Image.prototype, 'naturalWidth', {
    get() {
      return this._naturalWidth || 100;
    },
    set(val: number) {
      this._naturalWidth = val;
    },
    configurable: true,
  });

  Object.defineProperty(globalThis.Image.prototype, 'naturalHeight', {
    get() {
      return this._naturalHeight || 100;
    },
    set(val: number) {
      this._naturalHeight = val;
    },
    configurable: true,
  });

  Object.defineProperty(globalThis.Image.prototype, 'src', {
    set(value: string) {
      this._src = value;
      setTimeout(() => {
        if (this.onload) {
          this.onload(new Event('load'));
        }
      }, 0);
    },
    get() {
      return this._src;
    },
    configurable: true,
  });
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.toBlob = function (
    callback: (blob: Blob | null) => void,
    _type?: string,
    _quality?: any
  ) {
    setTimeout(() => {
      callback(new Blob(['mock_image'], { type: 'image/png' }));
    }, 0);
  };

  HTMLCanvasElement.prototype.getContext = function (contextType: string, ..._args: any[]): any {
    if (contextType === '2d') {
      const canvas = this as any;
      if (canvas._mockContext) {
        return canvas._mockContext;
      }
      const width = canvas.width || 300;
      const height = canvas.height || 150;
      const buffer = new Uint8ClampedArray(width * height * 4);

      let currentFillStyle = '#000000';
      let currentStrokeStyle = '#000000';

      const parseColor = (colorStr: string) => {
        if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
          const hex = colorStr.replace('#', '');
          if (hex.length === 6) {
            return {
              r: parseInt(hex.substring(0, 2), 16),
              g: parseInt(hex.substring(2, 4), 16),
              b: parseInt(hex.substring(4, 6), 16),
              a: 255,
            };
          }
        }
        return { r: 0, g: 0, b: 0, a: 255 };
      };

      const mockCtxObj = {
        canvas,
        get fillStyle() {
          return currentFillStyle;
        },
        set fillStyle(val: string) {
          currentFillStyle = val;
        },
        get strokeStyle() {
          return currentStrokeStyle;
        },
        set strokeStyle(val: string) {
          currentStrokeStyle = val;
        },
        lineWidth: 1,
        fillRect(x: number, y: number, w: number, h: number) {
          const { r, g, b, a } = parseColor(currentFillStyle);
          for (let py = Math.max(0, y); py < Math.min(canvas.height, y + h); py++) {
            for (let px = Math.max(0, x); px < Math.min(canvas.width, x + w); px++) {
              const idx = (py * canvas.width + px) * 4;
              buffer[idx] = r;
              buffer[idx + 1] = g;
              buffer[idx + 2] = b;
              buffer[idx + 3] = a;
            }
          }
        },
        strokeRect(x: number, y: number, w: number, h: number) {
          const { r, g, b, a } = parseColor(currentStrokeStyle);
          const lw = mockCtxObj.lineWidth || 1;
          for (let py = y; py < y + h; py++) {
            for (let px = x; px < x + w; px++) {
              const isBorder =
                py < y + lw || py >= y + h - lw || px < x + lw || px >= x + w - lw;
              if (isBorder && px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
                const idx = (py * canvas.width + px) * 4;
                buffer[idx] = r;
                buffer[idx + 1] = g;
                buffer[idx + 2] = b;
                buffer[idx + 3] = a;
              }
            }
          }
        },
        beginPath() {},
        ellipse() {},
        fill() {},
        fillText() {},
        drawImage() {},
        getImageData(x: number, y: number, w: number, h: number) {
          const imgDataArr = new Uint8ClampedArray(w * h * 4);
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              const srcX = x + px;
              const srcY = y + py;
              if (srcX >= 0 && srcX < canvas.width && srcY >= 0 && srcY < canvas.height) {
                const srcIdx = (srcY * canvas.width + srcX) * 4;
                const dstIdx = (py * w + px) * 4;
                imgDataArr[dstIdx] = buffer[srcIdx];
                imgDataArr[dstIdx + 1] = buffer[srcIdx + 1];
                imgDataArr[dstIdx + 2] = buffer[srcIdx + 2];
                imgDataArr[dstIdx + 3] = buffer[srcIdx + 3];
              }
            }
          }
          return new ImageData(imgDataArr, w, h);
        },
        putImageData(imgData: ImageData, dx: number, dy: number) {
          for (let py = 0; py < imgData.height; py++) {
            for (let px = 0; px < imgData.width; px++) {
              const targetX = dx + px;
              const targetY = dy + py;
              if (targetX >= 0 && targetX < canvas.width && targetY >= 0 && targetY < canvas.height) {
                const srcIdx = (py * imgData.width + px) * 4;
                const dstIdx = (targetY * canvas.width + targetX) * 4;
                buffer[dstIdx] = imgData.data[srcIdx];
                buffer[dstIdx + 1] = imgData.data[srcIdx + 1];
                buffer[dstIdx + 2] = imgData.data[srcIdx + 2];
                buffer[dstIdx + 3] = imgData.data[srcIdx + 3];
              }
            }
          }
        },
        toDataURL() {
          return 'data:image/png;base64,cleaned_result_mock';
        },
      } as unknown as CanvasRenderingContext2D;

      canvas._mockContext = mockCtxObj;
      return mockCtxObj;
    }
    return null;
  };
}
