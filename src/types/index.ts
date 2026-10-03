export interface BoundingBox {
  x: number; // Top-left X in pixels (original image resolution)
  y: number; // Top-left Y in pixels (original image resolution)
  width: number; // Width in pixels
  height: number; // Height in pixels
}

export type CleaningMethod = 'smart-fill' | 'solid-white' | 'border-sample' | 'brush' | 'opencv-telea' | 'lama' | 'migan';

export type RegionCategory = 'bubble-oval' | 'bubble-rect' | 'text-outside' | 'sfx';

export type ManualTool = 'rectangle' | 'brush';

export type GradientDirection = 'horizontal' | 'vertical' | 'diagonal';

export interface GradientOptions {
  startColor: string;
  endColor: string;
  direction: GradientDirection;
}

export interface TextRegion {
  id: string;
  bbox: BoundingBox;
  text: string;
  confidence: number; // 0 to 100
  isCleaned: boolean;
  isManual?: boolean;
  source?: 'manual' | 'auto';
  category?: RegionCategory;
  cleaningMethod?: CleaningMethod;
  originalText?: string;
  brushMask?: Uint8Array;
  isBrush?: boolean;
  brushPoints?: Array<{ x: number; y: number }>;
  brushSize?: number;
  translatedText?: string;
  // Future module placeholders:
  translation?: string;
  typesetting?: {
    x?: number;
    y?: number;
    bounds?: BoundingBox;
    padding?: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number | string;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    colorMode?: 'solid' | 'gradient';
    gradient?: {
      startColor?: string;
      endColor?: string;
      direction?: GradientDirection;
    };
    align?: 'left' | 'center' | 'right';
    vAlign?: 'top' | 'middle' | 'bottom';
    lineHeight?: number;
  };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HistoryEntry {
  cleanedUrl: string;
  croppedUrl?: string;
  width?: number;
  height?: number;
  regions: TextRegion[];
  description: string;
}

export interface ManhwaPage {
  id: string;
  name: string;
  file: File;
  originalUrl: string; // Pristine uploaded image object URL
  croppedUrl?: string;  // Cropped base image URL if page has been cropped
  cleanedUrl: string;  // Current cleaned canvas object URL
  width: number;
  height: number;
  originalWidth?: number;  // Initial pristine uploaded image width
  originalHeight?: number; // Initial pristine uploaded image height
  regions: TextRegion[];
  history: HistoryEntry[];
  historyIndex: number; // Index into history array (-1 for original base state)
  isProcessing: boolean;
  processingMessage?: string;
}

export interface CategoryCleaningFlags {
  cleanBubbleOval: boolean;
  cleanBubbleRect: boolean;
  cleanTextOutside: boolean;
  cleanSfx: boolean;
}

export interface CleaningOptions {
  method: CleaningMethod;
  padding: number; // Extra padding around bounding box in pixels
  fillColor?: string; // Color hex if solid color
  feather?: number; // Soft border feathering in pixels
  brushRadius?: number; // For manual brush cleanup
  categories?: CategoryCleaningFlags;
  isManualRegion?: boolean;
  category?: RegionCategory;
  brushMask?: Uint8Array;
  isBrush?: boolean;
  brushPoints?: Array<{ x: number; y: number }>;
  brushSize?: number;
}

export type WorkspaceViewMode = 'cleaned' | 'original' | 'side-by-side' | 'split-slider';

export type WorkflowStage = 'ocr-cleaning' | 'translation' | 'typesetting' | 'qc';
