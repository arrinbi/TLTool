export interface BoundingBox {
  x: number; // Top-left X in pixels (original image resolution)
  y: number; // Top-left Y in pixels (original image resolution)
  width: number; // Width in pixels
  height: number; // Height in pixels
}

export type CleaningMethod = 'smart-fill' | 'solid-white' | 'border-sample' | 'brush';

export interface TextRegion {
  id: string;
  bbox: BoundingBox;
  text: string;
  confidence: number; // 0 to 100
  isCleaned: boolean;
  cleaningMethod?: CleaningMethod;
  originalText?: string;
  // Future module placeholders:
  translation?: string;
  typesetting?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
  };
}

export interface HistoryEntry {
  cleanedUrl: string;
  regions: TextRegion[];
  description: string;
}

export interface ManhwaPage {
  id: string;
  name: string;
  file: File;
  originalUrl: string; // Pristine uploaded image object URL
  cleanedUrl: string;  // Current cleaned canvas object URL
  width: number;
  height: number;
  regions: TextRegion[];
  history: HistoryEntry[];
  historyIndex: number; // Index into history array (-1 for original base state)
  isProcessing: boolean;
  processingMessage?: string;
}

export interface CleaningOptions {
  method: CleaningMethod;
  padding: number; // Extra padding around bounding box in pixels
  fillColor?: string; // Color hex if solid color
  feather?: number; // Soft border feathering in pixels
  brushRadius?: number; // For manual brush cleanup
}

export type WorkspaceViewMode = 'cleaned' | 'original' | 'side-by-side' | 'split-slider';

export type WorkflowStage = 'ocr-cleaning' | 'translation' | 'typesetting' | 'qc';
