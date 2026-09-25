import React, { useState, useRef } from 'react';
import type { TextRegion, BoundingBox } from '../types';

interface RegionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  regions: TextRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onAddRegion: (bbox: BoundingBox) => void;
  onDeleteRegion: (id: string) => void;
  isDrawingMode: boolean;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  const scaleX = displayWidth / (imageWidth || 1);
  const scaleY = displayHeight / (imageHeight || 1);

  // Convert screen coordinates relative to container into original image pixel coordinates
  const screenToImage = (screenX: number, screenY: number) => {
    const x = Math.max(0, Math.min(imageWidth, Math.round(screenX / scaleX)));
    const y = Math.max(0, Math.min(imageHeight, Math.round(screenY / scaleY)));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (isDrawingMode) {
      setIsDrawing(true);
      const imgPos = screenToImage(clickX, clickY);
      setDrawStart(imgPos);
      setDrawCurrent(imgPos);
    } else if (e.target === containerRef.current) {
      // Clicked on empty canvas background
      onSelectRegion(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !containerRef.current || !drawStart) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    setDrawCurrent(screenToImage(clickX, clickY));
  };

  const handleMouseUp = () => {
    if (isDrawing && drawStart && drawCurrent) {
      const minX = Math.min(drawStart.x, drawCurrent.x);
      const minY = Math.min(drawStart.y, drawCurrent.y);
      const width = Math.abs(drawCurrent.x - drawStart.x);
      const height = Math.abs(drawCurrent.y - drawStart.y);

      // Only create if box has a minimum size
      if (width > 10 && height > 10) {
        onAddRegion({ x: minX, y: minY, width, height });
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
        isDrawingMode ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ width: displayWidth, height: displayHeight }}
    >
      {/* Existing Regions */}
      {regions.map((region) => {
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
                : region.isCleaned
                ? 'border-emerald-500/60 bg-emerald-500/10 hover:border-emerald-400'
                : 'border-amber-400/80 bg-amber-400/15 hover:border-amber-300'
            }`}
          >
            {/* Tag / Status label */}
            <div
              className={`absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white shadow-sm flex items-center gap-1 ${
                isSelected
                  ? 'bg-indigo-600'
                  : region.isCleaned
                  ? 'bg-emerald-600'
                  : 'bg-amber-600'
              }`}
            >
              <span>{region.isCleaned ? 'Cleaned' : 'Text'}</span>
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
