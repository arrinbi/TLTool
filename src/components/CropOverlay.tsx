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

type HandleType = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'draw';

export const CropOverlay: React.FC<CropOverlayProps> = ({
  imageWidth,
  imageHeight,
  displayWidth,
  displayHeight,
  cropRect,
  onChangeCropRect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
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

    if (handle === 'draw') {
      onChangeCropRect({
        x: pos.x,
        y: pos.y,
        width: 1,
        height: 1,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeHandle || !dragStart || !initialRect) return;
    const pos = pointerToImage(e);

    const minW = 10;
    const minH = 10;

    let { x, y, width, height } = initialRect;

    if (activeHandle === 'move') {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;

      x = Math.max(0, Math.min(imageWidth - width, initialRect.x + dx));
      y = Math.max(0, Math.min(imageHeight - height, initialRect.y + dy));
    } else if (activeHandle === 'draw') {
      const startX = dragStart.x;
      const startY = dragStart.y;

      const currentX = Math.max(0, Math.min(imageWidth, pos.x));
      const currentY = Math.max(0, Math.min(imageHeight, pos.y));

      x = Math.min(startX, currentX);
      y = Math.min(startY, currentY);
      width = Math.max(minW, Math.abs(currentX - startX));
      height = Math.max(minH, Math.abs(currentY - startY));
    } else {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;

      let left = initialRect.x;
      let top = initialRect.y;
      let right = initialRect.x + initialRect.width;
      let bottom = initialRect.y + initialRect.height;

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

      x = left;
      y = top;
      width = right - left;
      height = bottom - top;
    }

    onChangeCropRect({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeHandle) {
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
      onPointerDown={(e) => handlePointerDown(e, 'draw')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        className="border-2 border-indigo-400 bg-transparent shadow-2xl cursor-move group/crop"
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

        {/* 8 Resize Handles */}
        {/* NW */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'nw')}
          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow hover:scale-125 transition-transform"
        />
        {/* NE */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'ne')}
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow hover:scale-125 transition-transform"
        />
        {/* SW */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'sw')}
          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow hover:scale-125 transition-transform"
        />
        {/* SE */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'se')}
          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow hover:scale-125 transition-transform"
        />
        {/* N */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'n')}
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ns-resize shadow hover:scale-125 transition-transform"
        />
        {/* S */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 's')}
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ns-resize shadow hover:scale-125 transition-transform"
        />
        {/* W */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'w')}
          className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ew-resize shadow hover:scale-125 transition-transform"
        />
        {/* E */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'e')}
          className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ew-resize shadow hover:scale-125 transition-transform"
        />
      </div>
    </div>
  );
};
