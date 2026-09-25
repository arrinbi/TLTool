import React from 'react';
import { Download, Undo2, Redo2, Languages, Image as ImageIcon, FileCode } from 'lucide-react';
import type { ManhwaPage, WorkflowStage } from '../types';

interface HeaderToolbarProps {
  pages: ManhwaPage[];
  selectedPage: ManhwaPage | null;
  activeStage: WorkflowStage;
  onStageSelect: (stage: WorkflowStage) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportCleanedImage: () => void;
  onExportAllPages: () => void;
  onExportProjectJson: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  pages,
  selectedPage,
  activeStage,
  onStageSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportCleanedImage,
  onExportAllPages,
  onExportProjectJson,
}) => {
  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0 z-30">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
          <Languages className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            Manhwa Translation Assistant
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
              MVP 1.0
            </span>
          </h1>
          <p className="text-[11px] text-slate-400">OCR & Cleaning Studio</p>
        </div>
      </div>

      {/* Workflow Stage Pipeline Indicators */}
      <nav className="hidden md:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
        {[
          { id: 'ocr-cleaning', label: '1. OCR & Cleaning', active: true },
          { id: 'translation', label: '2. Translation (Soon)', active: false },
          { id: 'typesetting', label: '3. Typesetting (Soon)', active: false },
          { id: 'qc', label: '4. QC & Export (Soon)', active: false },
        ].map((stage) => (
          <button
            key={stage.id}
            onClick={() => stage.active && onStageSelect(stage.id as WorkflowStage)}
            disabled={!stage.active}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeStage === stage.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : stage.active
                ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                : 'text-slate-600 cursor-not-allowed opacity-60'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      {/* Action Toolbar: Undo, Redo & Export */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition-colors cursor-pointer"
            title="Undo Cleaning (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition-colors cursor-pointer"
            title="Redo Cleaning (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Export Options */}
        <div className="relative group">
          <button
            disabled={!selectedPage}
            onClick={onExportCleanedImage}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-emerald-600/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Cleaned Page</span>
          </button>

          {/* Export Dropdown Menu */}
          {pages.length > 0 && (
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-2xl min-w-48 z-50">
              <button
                onClick={onExportCleanedImage}
                disabled={!selectedPage}
                className="px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Download Current PNG (100% Res)</span>
              </button>
              <button
                onClick={onExportAllPages}
                className="px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download All Cleaned Pages</span>
              </button>
              <button
                onClick={onExportProjectJson}
                className="px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-800 mt-1"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Export Project JSON Data</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
