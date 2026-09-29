import React, { useState, useRef } from 'react';
import type { TextRegion, BoundingBox, RegionCategory } from '../types';

interface RegionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  regions: TextRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onAddRegion: (bbox: BoundingBox, category?: RegionCategory) => void;
  onDeleteRegion: (id: string) => void;
  isDrawingMode: boolean;
  manualCategory?: RegionCategory;
}

export const RegionOverlay: React.FC<RegionOverlayProps> = ({
  imageWidth,
  imageHeight,
  displayWidth,
  displayHeight,
  regions,
  selectedRegionId,
  onSelectRegion,
  onAddRegion,
  isDrawingMode,
  manualCategory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  const scaleX = displayWidth / (imageWidth || 1);
  const scaleY = displayHeight / (imageHeight || 1);

  // Convert pointer event client coordinates directly into original image pixel coordinates
  const pointerToImage = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageWidth || !imageHeight) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const x = Math.round(normX * imageWidth);
    const y = Math.round(normY * imageHeight);

    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    if (isDrawingMode) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Fallback if setPointerCapture is not supported in environment
      }
      setIsDrawing(true);
      const imgPos = pointerToImage(e);
      setDrawStart(imgPos);
      setDrawCurrent(imgPos);
    } else if (e.target === containerRef.current) {
      // Clicked on empty canvas background
      onSelectRegion(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !containerRef.current || !drawStart) return;
    setDrawCurrent(pointerToImage(e));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDrawing) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore fallback
      }

      const currentPos = pointerToImage(e);

      if (drawStart) {
        const minX = Math.min(drawStart.x, currentPos.x);
        const minY = Math.min(drawStart.y, currentPos.y);
        const width = Math.abs(currentPos.x - drawStart.x);
        const height = Math.abs(currentPos.y - drawStart.y);

        // Only create if box has a minimum size
        if (width > 10 && height > 10) {
          onAddRegion({ x: minX, y: minY, width, height }, manualCategory);
        }
      }
    }
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDrawing) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore fallback
      }
    }
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-10 ${
        isDrawingMode ? 'cursor-crosshair touch-none' : 'cursor-default'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{ width: displayWidth, height: displayHeight, touchAction: isDrawingMode ? 'none' : 'auto' }}
    >
      {/* Existing Regions */}
      {regions.filter((region) => !region.isCleaned).map((region) => {
        const isSelected = region.id === selectedRegionId;
        const left = region.bbox.x * scaleX;
        const top = region.bbox.y * scaleY;
        const width = region.bbox.width * scaleX;
        const height = region.bbox.height * scaleY;

        return (
          <div
            key={region.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRegion(region.id);
            }}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
            className={`group rounded border-2 transition-colors cursor-pointer ${
              isSelected
                ? 'border-indigo-400 bg-indigo-500/25 ring-2 ring-indigo-400/50'
                : 'border-amber-400/80 bg-amber-400/15 hover:border-amber-300'
            }`}
          >
            {/* Tag / Status label */}
            <div
              className={`absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white shadow-sm flex items-center gap-1 ${
                isSelected ? 'bg-indigo-600' : 'bg-amber-600'
              }`}
            >
              <span>Text</span>
            </div>
          </div>
        );
      })}

      {/* Currently Drawing Box Preview */}
      {isDrawing && drawStart && drawCurrent && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(drawStart.x, drawCurrent.x) * scaleX}px`,
            top: `${Math.min(drawStart.y, drawCurrent.y) * scaleY}px`,
            width: `${Math.abs(drawCurrent.x - drawStart.x) * scaleX}px`,
            height: `${Math.abs(drawCurrent.y - drawStart.y) * scaleY}px`,
          }}
          className="border-2 border-dashed border-sky-400 bg-sky-400/20 pointer-events-none rounded"
        />
      )}
    </div>
  );
};
