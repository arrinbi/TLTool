import React, { useState, useRef } from 'react';
import type { TextRegion, BoundingBox, RegionCategory, ManualTool } from '../types';

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
    extra?: { brushMask?: Uint8Array; isBrush?: boolean }
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
          const radius = Math.max(1, Math.round(brushSize / 2));
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }

          const pad = radius;
          const bboxX = Math.max(0, minX - pad);
          const bboxY = Math.max(0, minY - pad);
          const bboxMaxX = Math.min(imageWidth, maxX + pad);
          const bboxMaxY = Math.min(imageHeight, maxY + pad);
          const width = Math.max(1, bboxMaxX - bboxX);
          const height = Math.max(1, bboxMaxY - bboxY);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = radius * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (typeof ctx.moveTo === 'function' && typeof ctx.lineTo === 'function' && points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(points[0].x - bboxX, points[0].y - bboxY);
              for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x - bboxX, points[i].y - bboxY);
              }
              ctx.stroke();
            } else {
              // Interpolated fillRect fallback for environments where path methods are not mocked
              for (let i = 0; i < points.length; i++) {
                const px = points[i].x - bboxX;
                const py = points[i].y - bboxY;
                if (typeof ctx.arc === 'function') {
                  ctx.beginPath();
                  ctx.arc(px, py, radius, 0, Math.PI * 2);
                  ctx.fill();
                } else {
                  ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
                }

                if (i > 0) {
                  const p1 = points[i - 1];
                  const p2 = points[i];
                  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                  const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius / 2)));
                  for (let s = 1; s <= steps; s++) {
                    const ix = p1.x + (p2.x - p1.x) * (s / steps) - bboxX;
                    const iy = p1.y + (p2.y - p1.y) * (s / steps) - bboxY;
                    ctx.fillRect(ix - radius, iy - radius, radius * 2, radius * 2);
                  }
                }
              }
            }

            const imgData = ctx.getImageData(0, 0, width, height);
            const mask = new Uint8Array(width * height);
            let hasMaskPixels = false;
            for (let i = 0; i < width * height; i++) {
              if (imgData.data[i * 4] > 128) {
                mask[i] = 1;
                hasMaskPixels = true;
              }
            }

            if (hasMaskPixels) {
              onAddRegion(
                { x: bboxX, y: bboxY, width, height },
                manualCategory,
                { brushMask: mask, isBrush: true }
              );
            }
          }
        }
      } else {
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
                isSelected ? 'bg-indigo-600' : region.isBrush ? 'bg-purple-600' : 'bg-amber-600'
              }`}
            >
              <span>{region.isBrush ? 'Brush' : 'Text'}</span>
            </div>
          </div>
        );
      })}

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
