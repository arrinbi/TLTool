import React, { useState, useRef } from 'react';
import type { TextRegion, BoundingBox, RegionCategory, ManualTool } from '../types';
import { createBrushMask } from '../utils/brushUtils';

interface RegionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  regions: TextRegion[];
  selectedRegionId: string | null;
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
  isDrawingMode: boolean;
  manualTool?: ManualTool;
  brushSize?: number;
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
  manualTool = 'rectangle',
  brushSize = 15,
  manualCategory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [brushPoints, setBrushPoints] = useState<Array<{ x: number; y: number }>>([]);

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

      if (manualTool === 'brush') {
        setBrushPoints([imgPos]);
      } else {
        setDrawStart(imgPos);
        setDrawCurrent(imgPos);
      }
    } else if (e.target === containerRef.current) {
      // Clicked on empty canvas background
      onSelectRegion(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !containerRef.current) return;
    const imgPos = pointerToImage(e);

    if (manualTool === 'brush') {
      setBrushPoints((prev) => [...prev, imgPos]);
    } else {
      setDrawCurrent(imgPos);
    }
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

      if (manualTool === 'brush') {
        const currentPos = pointerToImage(e);
        const points = [...brushPoints, currentPos];

        if (points.length > 0) {
          const { bbox, mask } = createBrushMask(points, brushSize, imageWidth, imageHeight);

          let hasMaskPixels = false;
          for (let i = 0; i < mask.length; i++) {
            if (mask[i]) {
              hasMaskPixels = true;
              break;
            }
          }

          if (hasMaskPixels) {
            onAddRegion(
              bbox,
              manualCategory,
              { brushMask: mask, isBrush: true, brushPoints: points, brushSize }
            );
          }
        }
      } else {
        const currentPos = pointerToImage(e);

        if (drawStart) {
          const minX = Math.min(drawStart.x, currentPos.x);
          const minY = Math.min(drawStart.y, currentPos.y);
          const width = Math.abs(currentPos.x - drawStart.x);
          const height = Math.abs(currentPos.y - drawStart.y);

          // Prevent creation of zero-width or zero-height regions or accidental micro-clicks
          if (width > 5 && height > 5) {
            onAddRegion({ x: minX, y: minY, width, height }, manualCategory);
          }
        }
      }
    }
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    setBrushPoints([]);
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
    setBrushPoints([]);
  };

  const uncleanedRegions = regions.filter((region) => !region.isCleaned);
  const brushRegions = uncleanedRegions.filter((r) => r.isBrush || r.brushMask);
  const rectRegions = uncleanedRegions.filter((r) => !r.isBrush && !r.brushMask);

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
      {/* Rectangle Mode Regions */}
      {rectRegions.map((region) => {
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
                isSelected
                  ? 'bg-indigo-600'
                  : region.isManual || region.source === 'manual'
                  ? 'bg-amber-600'
                  : 'bg-slate-700'
              }`}
            >
              <span>{region.isManual || region.source === 'manual' ? 'Manual' : 'Text'}</span>
            </div>
          </div>
        );
      })}

      {/* SVG Overlay for Brush Mask Regions */}
      {brushRegions.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none z-10"
          style={{ width: displayWidth, height: displayHeight }}
        >
          {brushRegions.map((region) => {
            const isSelected = region.id === selectedRegionId;
            const left = region.bbox.x * scaleX;
            const top = region.bbox.y * scaleY;
            const width = region.bbox.width * scaleX;
            const height = region.bbox.height * scaleY;
            const size = region.brushSize || brushSize;
            const strokeW = Math.max(2, size * scaleX);

            let svgContent = null;
            if (region.brushPoints && region.brushPoints.length > 0) {
              const pts = region.brushPoints;
              if (pts.length === 1) {
                const cx = pts[0].x * scaleX;
                const cy = pts[0].y * scaleY;
                const r = Math.max(1, (size / 2) * scaleX);
                svgContent = (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={isSelected ? 'rgba(129, 140, 248, 0.6)' : 'rgba(168, 85, 247, 0.5)'}
                    stroke={isSelected ? '#818cf8' : '#a855f7'}
                    strokeWidth={2}
                  />
                );
              } else {
                const d =
                  `M ${pts[0].x * scaleX} ${pts[0].y * scaleY} ` +
                  pts
                    .slice(1)
                    .map((p) => `L ${p.x * scaleX} ${p.y * scaleY}`)
                    .join(' ');

                svgContent = (
                  <path
                    d={d}
                    stroke={isSelected ? 'rgba(129, 140, 248, 0.7)' : 'rgba(168, 85, 247, 0.55)'}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                );
              }
            } else {
              svgContent = (
                <rect
                  x={left}
                  y={top}
                  width={width}
                  height={height}
                  fill={isSelected ? 'rgba(129, 140, 248, 0.4)' : 'rgba(168, 85, 247, 0.35)'}
                  rx={4}
                />
              );
            }

            return (
              <g
                key={region.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRegion(region.id);
                }}
                className="cursor-pointer pointer-events-auto group"
              >
                {svgContent}
                <foreignObject
                  x={left}
                  y={Math.max(0, top - 24)}
                  width={60}
                  height={24}
                  className="overflow-visible pointer-events-auto"
                >
                  <div
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white shadow-sm inline-flex items-center gap-1 ${
                      isSelected ? 'bg-indigo-600' : 'bg-purple-600'
                    }`}
                  >
                    <span>Brush</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      )}

      {/* Currently Drawing Box Preview (Rectangle) */}
      {isDrawing && manualTool === 'rectangle' && drawStart && drawCurrent && (
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

      {/* Currently Drawing Stroke Preview (Brush) */}
      {isDrawing && manualTool === 'brush' && brushPoints.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none z-20"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <path
            d={
              brushPoints.length === 1
                ? `M ${brushPoints[0].x * scaleX} ${brushPoints[0].y * scaleY} L ${
                    brushPoints[0].x * scaleX
                  } ${brushPoints[0].y * scaleY}`
                : `M ${brushPoints[0].x * scaleX} ${brushPoints[0].y * scaleY} ` +
                  brushPoints
                    .slice(1)
                    .map((p) => `L ${p.x * scaleX} ${p.y * scaleY}`)
                    .join(' ')
            }
            stroke="rgba(56, 189, 248, 0.6)"
            strokeWidth={Math.max(2, brushSize * scaleX)}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
};
