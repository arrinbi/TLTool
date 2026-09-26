import React, { useState } from 'react';
import {
  Sparkles,
  Eraser,
  Trash2,
  RefreshCw,
  Info,
  Wand2,
  X,
} from 'lucide-react';
import type { TextRegion, CleaningOptions, CleaningMethod, ManhwaPage } from '../types';
import { CLEANING_LIMITATIONS_NOTICE } from '../modules/cleaning/cleaningService';

interface RegionInspectorProps {
  page: ManhwaPage | null;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onDeleteRegion: (id: string) => void;
  onRunOcr: () => void;
  onCleanRegion: (regionId: string, options: CleaningOptions) => void;
  onCleanAllRegions: (options: CleaningOptions) => void;
  onRevertRegion: (regionId: string) => void;
}

export const RegionInspector: React.FC<RegionInspectorProps> = ({
  page,
  selectedRegionId,
  onSelectRegion,
  onUpdateRegion,
  onDeleteRegion,
  onRunOcr,
  onCleanRegion,
  onCleanAllRegions,
  onRevertRegion,
}) => {
  const [cleaningMethod, setCleaningMethod] = useState<CleaningMethod>('smart-fill');
  const [padding, setPadding] = useState<number>(3);
  const [fillColor, setFillColor] = useState<string>('#ffffff');
  const [showLimitationsModal, setShowLimitationsModal] = useState<boolean>(false);

  if (!page) {
    return null;
  }

  const selectedRegion = page.regions.find((r) => r.id === selectedRegionId);

  const activeOptions: CleaningOptions = {
    method: cleaningMethod,
    padding,
    fillColor,
  };

  return (
    <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-auto lg:h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-slate-100 text-sm">Text & Cleaning</h2>
        </div>
        <button
          onClick={() => setShowLimitationsModal(true)}
          className="p-1 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
          title="View Cleaning Limitations & Tips"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
        {/* Bulk Actions */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Automated Tools
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onRunOcr}
              disabled={page.isProcessing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${page.isProcessing ? 'animate-spin' : ''}`} />
              <span>Detect Text</span>
            </button>
            <button
              onClick={() => onCleanAllRegions(activeOptions)}
              disabled={page.regions.length === 0 || page.isProcessing}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Clean All</span>
            </button>
          </div>
        </div>

        {/* Cleaning Method Settings */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-3">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Cleaning Engine Options
          </span>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-300 font-medium">Method</label>
            <select
              value={cleaningMethod}
              onChange={(e) => setCleaningMethod(e.target.value as CleaningMethod)}
              className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="smart-fill">Smart Fill (Border Inpaint)</option>
              <option value="solid-white">Solid Fill Color</option>
              <option value="border-sample">Border Average Color</option>
            </select>
          </div>

          {cleaningMethod === 'solid-white' && (
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-300 font-medium">Fill Color</label>
              <input
                type="color"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-slate-300 font-medium">
              <span>Padding Margin</span>
              <span className="text-slate-400">{padding} px</span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="accent-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Selected Region Editor */}
        {selectedRegion ? (
          <div className="bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-500/40 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300">
                Region #{selectedRegion.id.slice(-4)}
              </span>
              <button
                onClick={() => onDeleteRegion(selectedRegion.id)}
                className="p-1 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded transition-colors cursor-pointer"
                title="Delete Box"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Region Type / Category Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-slate-400 font-medium">Region Category</label>
              <select
                value={selectedRegion.category || 'bubble-oval'}
                onChange={(e) =>
                  onUpdateRegion({
                    ...selectedRegion,
                    category: e.target.value as any,
                  })
                }
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="bubble-oval">Bubble (Oval / Round)</option>
                <option value="bubble-rect">Bubble (Square / Box)</option>
                <option value="text-outside">Floating Text (Outside Bubble)</option>
                <option value="sfx">SFX (Sound Effects)</option>
              </select>
            </div>

            {/* Region Text Content */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-slate-400 font-medium">Detected Text</label>
              <textarea
                rows={3}
                value={selectedRegion.text}
                onChange={(e) => onUpdateRegion({ ...selectedRegion, text: e.target.value })}
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500"
                placeholder="OCR Text output..."
              />
            </div>

            {/* Region Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {selectedRegion.isCleaned ? (
                <button
                  onClick={() => onRevertRegion(selectedRegion.id)}
                  className="col-span-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Revert Region Cleaning</span>
                </button>
              ) : (
                <button
                  onClick={() => onCleanRegion(selectedRegion.id, activeOptions)}
                  className="col-span-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Clean Selected Region</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 text-center text-slate-400 text-xs">
            Click any text box on the canvas or draw a new box to view and edit properties.
          </div>
        )}

        {/* All Regions List */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Detected Regions ({page.regions.length})
          </span>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {page.regions.map((region) => {
              const isSelected = region.id === selectedRegionId;

              return (
                <div
                  key={region.id}
                  onClick={() => onSelectRegion(region.id)}
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/40 text-slate-100'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="truncate flex-1 pr-2">
                    <span className="font-mono text-[10px] text-slate-500 mr-1.5">
                      [{region.bbox.width}×{region.bbox.height}]
                    </span>
                    <span>{region.text || '(empty box)'}</span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      region.isCleaned
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {region.isCleaned ? 'Cleaned' : 'Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Limitations Documentation Modal */}
      {showLimitationsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 relative shadow-2xl">
            <button
              onClick={() => setShowLimitationsModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-100 mb-3">
              {CLEANING_LIMITATIONS_NOTICE.title}
            </h3>

            <div className="flex flex-col gap-3 my-4">
              {CLEANING_LIMITATIONS_NOTICE.items.map((item, idx) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-indigo-300">{item.category}</span>
                    <span className="text-[10px] text-amber-400 font-medium">{item.effectiveness}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowLimitationsModal(false)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
