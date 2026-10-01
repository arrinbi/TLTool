import React, { useState, useRef, useCallback } from 'react';
import type { CropRect } from '../types';

interface CropOverlayProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  cropRect: CropRect;
  onChangeCropRect: (newRect: CropRect) => void;
}

export type CropHandleType = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

interface HandleDef {
  id: CropHandleType;
  name: string;
  className: string;
  cursor: string;
}

const HANDLES: HandleDef[] = [
  { id: 'nw', name: 'top-left', className: '-top-4 -left-4', cursor: 'cursor-nwse-resize' },
  { id: 'n', name: 'top-center', className: '-top-4 left-1/2 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { id: 'ne', name: 'top-right', className: '-top-4 -right-4', cursor: 'cursor-nesw-resize' },
  { id: 'w', name: 'middle-left', className: 'top-1/2 -left-4 -translate-y-1/2', cursor: 'cursor-ew-resize' },
  { id: 'e', name: 'middle-right', className: 'top-1/2 -right-4 -translate-y-1/2', cursor: 'cursor-ew-resize' },
  { id: 'sw', name: 'bottom-left', className: '-bottom-4 -left-4', cursor: 'cursor-nesw-resize' },
  { id: 's', name: 'bottom-center', className: '-bottom-4 left-1/2 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { id: 'se', name: 'bottom-right', className: '-bottom-4 -right-4', cursor: 'cursor-nwse-resize' },
];

export const CropOverlay: React.FC<CropOverlayProps> = ({
  imageWidth,
  imageHeight,
  displayWidth,
  displayHeight,
  cropRect,
  onChangeCropRect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<CropHandleType | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [initialRect, setInitialRect] = useState<CropRect | null>(null);

  const scaleX = displayWidth / (imageWidth || 1);
  const scaleY = displayHeight / (imageHeight || 1);

  // Convert pointer position into image pixel coordinates
  const pointerToImage = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current || !imageWidth || !imageHeight) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const x = Math.round(normX * imageWidth);
      const y = Math.round(normY * imageHeight);

      return { x, y };
    },
    [imageWidth, imageHeight]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: CropHandleType) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback if setPointerCapture is unsupported
    }

    const pos = pointerToImage(e);
    setActiveHandle(handle);
    setDragStart(pos);
    setInitialRect({ ...cropRect });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeHandle || !dragStart || !initialRect) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = pointerToImage(e);

    const minW = 10;
    const minH = 10;

    let left = initialRect.x;
    let top = initialRect.y;
    let right = initialRect.x + initialRect.width;
    let bottom = initialRect.y + initialRect.height;

    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;

    if (activeHandle.includes('w')) {
      left = Math.max(0, Math.min(right - minW, initialRect.x + dx));
    }
    if (activeHandle.includes('e')) {
      right = Math.min(imageWidth, Math.max(left + minW, initialRect.x + initialRect.width + dx));
    }
    if (activeHandle.includes('n')) {
      top = Math.max(0, Math.min(bottom - minH, initialRect.y + dy));
    }
    if (activeHandle.includes('s')) {
      bottom = Math.min(
        imageHeight,
        Math.max(top + minH, initialRect.y + initialRect.height + dy)
      );
    }

    const x = left;
    const y = top;
    const width = right - left;
    const height = bottom - top;

    onChangeCropRect({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeHandle) {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Fallback
      }
    }
    setActiveHandle(null);
    setDragStart(null);
    setInitialRect(null);
  };

  const displayX = cropRect.x * scaleX;
  const displayY = cropRect.y * scaleY;
  const displayW = cropRect.width * scaleX;
  const displayH = cropRect.height * scaleY;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 touch-none select-none overflow-hidden"
      style={{ width: displayWidth, height: displayHeight }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-testid="crop-overlay-container"
    >
      {/* Visual Dimmed Backdrop outside crop area */}
      {/* Top Dimmed Rect */}
      <div
        className="absolute bg-black/65 pointer-events-none"
        style={{ left: 0, top: 0, width: displayWidth, height: Math.max(0, displayY) }}
      />
      {/* Bottom Dimmed Rect */}
      <div
        className="absolute bg-black/65 pointer-events-none"
        style={{
          left: 0,
          top: Math.min(displayHeight, displayY + displayH),
          width: displayWidth,
          height: Math.max(0, displayHeight - (displayY + displayH)),
        }}
      />
      {/* Left Dimmed Rect */}
      <div
        className="absolute bg-black/65 pointer-events-none"
        style={{
          left: 0,
          top: displayY,
          width: Math.max(0, displayX),
          height: displayH,
        }}
      />
      {/* Right Dimmed Rect */}
      <div
        className="absolute bg-black/65 pointer-events-none"
        style={{
          left: Math.min(displayWidth, displayX + displayW),
          top: displayY,
          width: Math.max(0, displayWidth - (displayX + displayW)),
          height: displayH,
        }}
      />

      {/* Active Crop Selection Box */}
      <div
        style={{
          position: 'absolute',
          left: `${displayX}px`,
          top: `${displayY}px`,
          width: `${displayW}px`,
          height: `${displayH}px`,
        }}
        data-testid="crop-selection-box"
        className="border-2 border-indigo-400 bg-transparent shadow-2xl relative cursor-default"
      >
        {/* Dimensions & Offset Info Tooltip */}
        <div className="absolute -top-7 left-0 bg-slate-900/90 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow pointer-events-none flex items-center gap-1.5">
          <span className="font-semibold text-white">
            {cropRect.width} × {cropRect.height} px
          </span>
          <span className="text-slate-400 text-[9px]">
            (X: {cropRect.x}, Y: {cropRect.y})
          </span>
        </div>

        {/* Inner Grid Guidelines */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30 border border-indigo-300/40">
          <div className="border-r border-b border-indigo-300/30" />
          <div className="border-r border-b border-indigo-300/30" />
          <div className="border-b border-indigo-300/30" />
          <div className="border-r border-b border-indigo-300/30" />
          <div className="border-r border-b border-indigo-300/30" />
          <div className="border-b border-indigo-300/30" />
          <div className="border-r border-indigo-300/30" />
          <div className="border-r border-indigo-300/30" />
          <div />
        </div>

        {/* Exactly 8 Resize Handles */}
        {HANDLES.map((handle) => (
          <div
            key={handle.id}
            data-testid={`crop-handle-${handle.name}`}
            data-handle={handle.name}
            aria-label={`Resize crop ${handle.name}`}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => handlePointerDown(e, handle.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`absolute ${handle.className} w-8 h-8 flex items-center justify-center ${handle.cursor} z-40 touch-none select-none`}
          >
            <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs shadow pointer-events-none hover:scale-125 transition-transform" />
          </div>
        ))}
      </div>
    </div>
  );
};
