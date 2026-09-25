import React, { useState, useRef, useEffect } from 'react';
import { Eye, SplitSquareVertical, Columns, Maximize2, ZoomIn, ZoomOut, RotateCcw, Plus, MousePointer } from 'lucide-react';
import type { ManhwaPage, TextRegion, WorkspaceViewMode, BoundingBox } from '../types';
import { RegionOverlay } from './RegionOverlay';

interface MainWorkspaceProps {
  page: ManhwaPage | null;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onAddRegion: (bbox: BoundingBox) => void;
  onDeleteRegion: (id: string) => void;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  page,
  selectedRegionId,
  onSelectRegion,
  onUpdateRegion,
  onAddRegion,
  onDeleteRegion,
}) => {
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('cleaned');
  const [zoom, setZoom] = useState<number>(1);
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(50); // Split slider percentage (0-100)
  const isDraggingSplit = useRef<boolean>(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Update display dimensions on window resize or page load
  useEffect(() => {
    const updateDimensions = () => {
      if (imageRef.current) {
        setDisplaySize({
          width: imageRef.current.clientWidth,
          height: imageRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [page, viewMode, zoom]);

  const handleSplitMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSplit.current || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
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

        {/* Mode & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Draw / Select Tool Toggle */}
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
        className="flex-1 overflow-auto p-4 flex items-center justify-center relative select-none"
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="transition-transform duration-75 max-w-full"
        >
          {/* Single Image Views (Cleaned or Original) */}
          {(viewMode === 'cleaned' || viewMode === 'original') && (
            <div className="relative inline-block border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900">
              <img
                ref={imageRef}
                src={viewMode === 'cleaned' ? page.cleanedUrl : page.originalUrl}
                alt={page.name}
                onLoad={() => {
                  if (imageRef.current) {
                    setDisplaySize({
                      width: imageRef.current.clientWidth,
                      height: imageRef.current.clientHeight,
                    });
                  }
                }}
                className="max-h-[80vh] w-auto object-contain block"
              />

              {/* Bounding Box Region Overlay (Active in Cleaned View) */}
              {viewMode === 'cleaned' && displaySize.width > 0 && (
                <RegionOverlay
                  imageWidth={page.width}
                  imageHeight={page.height}
                  displayWidth={displaySize.width}
                  displayHeight={displaySize.height}
                  regions={page.regions}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={onSelectRegion}
                  onUpdateRegion={onUpdateRegion}
                  onAddRegion={onAddRegion}
                  onDeleteRegion={onDeleteRegion}
                  isDrawingMode={isDrawingMode}
                />
              )}
            </div>
          )}

          {/* Side-by-Side Comparison */}
          {viewMode === 'side-by-side' && (
            <div className="flex gap-4 items-center justify-center max-w-full">
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-semibold text-slate-400 mb-1">Original</span>
                <div className="border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900">
                  <img
                    src={page.originalUrl}
                    alt="Original"
                    className="max-h-[75vh] w-auto object-contain block"
                  />
                </div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-semibold text-emerald-400 mb-1">Cleaned Preview</span>
                <div className="border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900">
                  <img
                    src={page.cleanedUrl}
                    alt="Cleaned"
                    className="max-h-[75vh] w-auto object-contain block"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Split Comparison Slider View */}
          {viewMode === 'split-slider' && (
            <div className="relative inline-block border border-slate-800 rounded shadow-2xl overflow-hidden bg-slate-900">
              {/* Cleaned Image Underneath */}
              <img
                src={page.cleanedUrl}
                alt="Cleaned"
                className="max-h-[80vh] w-auto object-contain block"
              />

              {/* Original Image Clipped Above */}
              <div
                style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
                className="absolute inset-0"
              >
                <img
                  src={page.originalUrl}
                  alt="Original"
                  className="max-h-[80vh] w-auto object-contain block"
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
      </div>
    </main>
  );
};
