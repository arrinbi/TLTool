import React, { useState, useRef, useEffect } from 'react';
import { Eye, SplitSquareVertical, Columns, Maximize2, ZoomIn, ZoomOut, RotateCcw, Plus, MousePointer, Sparkles, Square, Paintbrush, Crop, Check, X } from 'lucide-react';
import type { ManhwaPage, TextRegion, WorkspaceViewMode, BoundingBox, RegionCategory, ManualTool, CropRect, WorkflowStage } from '../types';
import type { QcReport } from '../modules/qc/qcService';
import { RegionOverlay } from './RegionOverlay';
import { CropOverlay } from './CropOverlay';

interface MainWorkspaceProps {
  page: ManhwaPage | null;
  selectedRegionId: string | null;
  activeStage?: WorkflowStage;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onAddRegion: (
    bbox: BoundingBox,
    category?: RegionCategory,
    extra?: {
      brushMask?: Uint8Array;
      isBrush?: boolean;
      brushPoints?: Array<{ x: number; y: number }>;
      brushSize?: number;
    }
  ) => void;
  onDeleteRegion: (id: string) => void;
  detectionMode: 'auto' | 'manual';
  onSelectDetectionMode: (mode: 'auto' | 'manual') => void;
  manualTool?: ManualTool;
  onSelectManualTool?: (tool: ManualTool) => void;
  brushSize?: number;
  onSelectBrushSize?: (size: number) => void;
  manualCategory: RegionCategory;
  onSelectManualCategory: (category: RegionCategory) => void;
  isDrawingMode: boolean;
  setIsDrawingMode: (drawing: boolean) => void;
  onRunOcr: () => void;
  // Crop Tool Props
  isCropMode?: boolean;
  onToggleCropMode?: () => void;
  cropRect?: CropRect | null;
  onChangeCropRect?: (rect: CropRect) => void;
  onApplyCrop?: () => void;
  onCancelCrop?: () => void;
  onResetCropRect?: () => void;
  defaultFontFamily?: string;
  qcReport?: QcReport | null;
}

const MainWorkspaceComponent: React.FC<MainWorkspaceProps> = ({
  page,
  selectedRegionId,
  activeStage = 'ocr-cleaning',
  onSelectRegion,
  onUpdateRegion,
  onAddRegion,
  onDeleteRegion,
  detectionMode,
  onSelectDetectionMode,
  manualTool = 'rectangle',
  onSelectManualTool,
  brushSize = 15,
  onSelectBrushSize,
  manualCategory,
  onSelectManualCategory,
  isDrawingMode,
  setIsDrawingMode,
  onRunOcr,
  isCropMode = false,
  onToggleCropMode,
  cropRect,
  onChangeCropRect,
  onApplyCrop,
  onCancelCrop,
  onResetCropRect,
  defaultFontFamily = 'sans-serif',
  qcReport,
}) => {
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('cleaned');
  const [zoom, setZoom] = useState<number>(1);
  const [splitPos, setSplitPos] = useState<number>(50); // Split slider percentage (0-100)
  const isDraggingSplit = useRef<boolean>(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const splitSliderRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const imgWidth = page?.width || displaySize.width || 800;
  const imgHeight = page?.height || displaySize.height || 1200;
  const renderedWidth = Math.round(imgWidth * zoom);
  const renderedHeight = Math.round(imgHeight * zoom);

  // Update display dimensions on window resize or page load
  useEffect(() => {
    const updateDimensions = () => {
      if (imageRef.current && imageRef.current.naturalWidth) {
        const nw = imageRef.current.naturalWidth;
        const nh = imageRef.current.naturalHeight;
        setDisplaySize((prev) => {
          if (prev.width === nw && prev.height === nh) return prev;
          return { width: nw, height: nh };
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [page?.id, page?.cleanedUrl, page?.originalUrl, viewMode]);

  const handleSplitMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'split-slider' || !isDraggingSplit.current) return;
    const targetRef = splitSliderRef.current || workspaceRef.current;
    if (!targetRef) return;
    const rect = targetRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSplitPos(pct);
  };

  const handleSplitMouseUp = () => {
    isDraggingSplit.current = false;
  };

  if (!page) {
    return (
      <main className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
          <Eye className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No Page Selected</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Upload manga/manhwa image pages using the sidebar on the left to start detecting and cleaning text.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden relative">
      {/* Workspace Controls Toolbar */}
      <div className="h-12 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between gap-2 overflow-x-auto shrink-0 z-20">
        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('cleaned')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'cleaned'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Cleaned / Preview View"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Cleaned</span>
          </button>
          <button
            onClick={() => setViewMode('original')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'original'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Original Unaltered View"
          >
            <span>Original</span>
          </button>
          <button
            onClick={() => setViewMode('side-by-side')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'side-by-side'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Side-by-Side Comparison"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Side-by-Side</span>
          </button>
          <button
            onClick={() => setViewMode('split-slider')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'split-slider'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Interactive Split Comparison Slider"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>Split Slider</span>
          </button>
        </div>

        {/* Crop Tool & Mode Controls */}
        <div className="flex items-center gap-2">
          {/* Crop Mode Controls */}
          {onToggleCropMode && activeStage === 'ocr-cleaning' && (
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={onToggleCropMode}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isCropMode
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Crop Tool"
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Crop</span>
              </button>

              {isCropMode && (
                <>
                  <button
                    onClick={onApplyCrop}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                    title="Apply Crop Selection"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply</span>
                  </button>
                  {onResetCropRect && (
                    <button
                      onClick={onResetCropRect}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
                      title="Reset Crop Box to Full Page"
                    >
                      <span>Reset</span>
                    </button>
                  )}
                  <button
                    onClick={onCancelCrop}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="Cancel Crop"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Detection Mode Switcher & Manual Selection Tools (Stage 1 only) */}
          {activeStage === 'ocr-cleaning' && (
            <>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => {
                    onSelectDetectionMode('auto');
                    onRunOcr();
                  }}
                  disabled={page.isProcessing}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    detectionMode === 'auto'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  } disabled:opacity-50`}
                  title="Automatic Detection (Run OCR)"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Automatic Detection</span>
                </button>
                <button
                  onClick={() => onSelectDetectionMode('manual')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    detectionMode === 'manual'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                  title="Manual Selection (Draw Text Regions)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Manual Selection</span>
                </button>
              </div>

              {/* Tool & Category Selector when in Manual Selection Mode */}
              {detectionMode === 'manual' && (
                <>
                  {/* Manual Selection Tool Toggle: Rectangle vs Brush */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      onClick={() => onSelectManualTool?.('rectangle')}
                      className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                        manualTool === 'rectangle'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Rectangle Selection Tool"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Rectangle</span>
                    </button>
                    <button
                      onClick={() => onSelectManualTool?.('brush')}
                      className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                        manualTool === 'brush'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Brush Selection Tool"
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      <span>Brush</span>
                    </button>
                  </div>

                  {/* Brush Size Slider when Brush mode active */}
                  {manualTool === 'brush' && (
                    <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
                      <span className="text-slate-400 text-[11px]">Size:</span>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={brushSize}
                        onChange={(e) => onSelectBrushSize?.(Number(e.target.value))}
                        className="w-16 accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-slate-300 font-mono text-[10px] w-6">{brushSize}px</span>
                    </div>
                  )}

                  {/* Category Selector */}
                  <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
                    <span className="text-slate-400 text-[11px]">Category:</span>
                    <select
                      value={manualCategory}
                      onChange={(e) => onSelectManualCategory(e.target.value as RegionCategory)}
                      className="bg-slate-900 border border-slate-800 text-slate-200 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="bubble-oval">Bubble Oval/Round</option>
                      <option value="bubble-rect">Bubble Square/Box</option>
                      <option value="text-outside">Floating Text (Outside Bubble)</option>
                      <option value="sfx">SFX (Sound Effects)</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {/* Draw / Select Tool Toggle */}
          {activeStage === 'ocr-cleaning' && (
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setIsDrawingMode(false)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  !isDrawingMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Select & Inspect Mode"
              >
                <MousePointer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsDrawingMode(true)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  isDrawingMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Draw New Text Box Tool"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Zoom Level */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-12 text-center text-slate-300 font-mono text-[11px]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport Area */}
      <div
        ref={workspaceRef}
        onMouseMove={handleSplitMouseMove}
        onMouseUp={handleSplitMouseUp}
        className="flex-1 overflow-auto p-4 relative select-none"
      >
        {/* Single Image Views (Cleaned or Original) */}
        {(viewMode === 'cleaned' || viewMode === 'original') && (
          <div
            style={{
              width: `${renderedWidth}px`,
              height: `${renderedHeight}px`,
              willChange: 'transform',
              transform: 'translateZ(0)',
            }}
            className="relative mx-auto border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900 shrink-0"
          >
            <img
              ref={imageRef}
              src={viewMode === 'cleaned' ? page.cleanedUrl : page.originalUrl}
              alt={page.name}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  const nw = img.naturalWidth;
                  const nh = img.naturalHeight;
                  setDisplaySize((prev) => {
                    if (prev.width === nw && prev.height === nh) return prev;
                    return { width: nw, height: nh };
                  });
                }
              }}
              style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
              className="block object-contain"
            />

            {/* Crop Overlay when Crop Mode active */}
            {isCropMode && cropRect && onChangeCropRect && (
              <CropOverlay
                imageWidth={page.width}
                imageHeight={page.height}
                displayWidth={renderedWidth}
                displayHeight={renderedHeight}
                cropRect={cropRect}
                onChangeCropRect={onChangeCropRect}
              />
            )}

            {/* Bounding Box Region Overlay (Active in Cleaned View when not cropping) */}
            {!isCropMode && viewMode === 'cleaned' && (
              <RegionOverlay
                imageWidth={page.width}
                imageHeight={page.height}
                displayWidth={renderedWidth}
                displayHeight={renderedHeight}
                regions={page.regions}
                selectedRegionId={selectedRegionId}
                activeStage={activeStage}
                onSelectRegion={onSelectRegion}
                onUpdateRegion={onUpdateRegion}
                onAddRegion={onAddRegion}
                onDeleteRegion={onDeleteRegion}
                isDrawingMode={isDrawingMode}
                manualTool={manualTool}
                brushSize={brushSize}
                manualCategory={manualCategory}
                defaultFontFamily={defaultFontFamily}
                qcReport={qcReport}
              />
            )}
          </div>
        )}

        {/* Side-by-Side Comparison */}
        {viewMode === 'side-by-side' && (
          <div className="flex gap-4 items-start justify-center mx-auto min-w-max">
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-slate-400 mb-1">Original</span>
              <div
                style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
                className="border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900 shrink-0"
              >
                <img
                  src={page.originalUrl}
                  alt="Original"
                  style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
                  className="block object-contain"
                />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-emerald-400 mb-1">Cleaned Preview</span>
              <div
                style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
                className="border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900 shrink-0"
              >
                <img
                  src={page.cleanedUrl}
                  alt="Cleaned"
                  style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
                  className="block object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {/* Split Comparison Slider View */}
        {viewMode === 'split-slider' && (
          <div
            ref={splitSliderRef}
            style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
            className="relative mx-auto border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900 shrink-0"
          >
            {/* Cleaned Image Underneath */}
            <img
              src={page.cleanedUrl}
              alt="Cleaned"
              style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
              className="block object-contain"
            />

            {/* Original Image Clipped Above */}
            <div
              style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
              className="absolute inset-0"
            >
              <img
                src={page.originalUrl}
                alt="Original"
                style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}
                className="block object-contain"
              />
            </div>

            {/* Interactive Divider Line */}
            <div
              style={{ left: `${splitPos}%` }}
              onMouseDown={() => (isDraggingSplit.current = true)}
              className="absolute top-0 bottom-0 w-1 bg-indigo-500 cursor-ew-resize flex items-center justify-center shadow-lg"
            >
              <div className="w-6 h-6 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center shadow">
                <Maximize2 className="w-3 h-3 text-white rotate-45" />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export const MainWorkspace = React.memo(MainWorkspaceComponent);
