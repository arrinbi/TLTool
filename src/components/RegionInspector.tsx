import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Eraser,
  Trash2,
  RefreshCw,
  Info,
  Wand2,
  X,
  Plus,
  Square,
  Paintbrush,
  Languages,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  Upload,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { TextRegion, CleaningOptions, CleaningMethod, ManhwaPage, RegionCategory, ManualTool, WorkflowStage } from '../types';
import type { QcReport, QcIssue } from '../modules/qc/qcService';
import { CLEANING_LIMITATIONS_NOTICE } from '../modules/cleaning/cleaningService';
import {
  AVAILABLE_FONTS,
  getEffectiveTypesettingStyle,
  calculateAutoFontSize,
} from '../modules/typesetting/typesettingService';
import type { CustomFont, UploadFontResult } from '../modules/typesetting/fontService';

interface RegionInspectorProps {
  page: ManhwaPage | null;
  selectedRegionId: string | null;
  activeStage?: WorkflowStage;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (region: TextRegion) => void;
  onDeleteRegion: (id: string) => void;
  detectionMode: 'auto' | 'manual';
  onSelectDetectionMode: (mode: 'auto' | 'manual') => void;
  manualTool?: ManualTool;
  onSelectManualTool?: (tool: ManualTool) => void;
  brushSize?: number;
  onSelectBrushSize?: (size: number) => void;
  manualCategory: RegionCategory;
  onSelectManualCategory: (category: RegionCategory) => void;
  onRunOcr: () => void;
  onRunOcrOnRegion?: (regionId: string) => void;
  onCleanRegion: (regionId: string, options: CleaningOptions) => void;
  onCleanAllRegions: (options: CleaningOptions) => void;
  onRevertRegion: (regionId: string) => void;
  onTranslateRegion?: (regionId: string) => void;
  onTranslateAllRegions?: () => void;
  onTypesetAllRegions?: () => void;
  onClearTypesetting?: () => void;
  customFonts?: CustomFont[];
  defaultFontFamily?: string;
  onChangeDefaultFontFamily?: (fontFamily: string) => void;
  onUploadFontFile?: (file: File) => Promise<UploadFontResult | void>;
  onRemoveCustomFont?: (fontId: string) => void;
  fontUploadStatus?: { message: string; isError?: boolean } | null;

  // QC Workspace Props
  qcReport?: QcReport | null;
  onRunQc?: () => void;
  onNextIssue?: () => void;
  onPreviousIssue?: () => void;
  currentIssueIndex?: number;
  selectedIssueId?: string | null;
  onSelectIssue?: (issue: QcIssue) => void;
}

export const RegionInspector: React.FC<RegionInspectorProps> = ({
  page,
  selectedRegionId,
  activeStage = 'ocr-cleaning',
  onSelectRegion,
  onUpdateRegion,
  onDeleteRegion,
  detectionMode,
  onSelectDetectionMode,
  manualTool = 'rectangle',
  onSelectManualTool,
  brushSize = 15,
  onSelectBrushSize,
  manualCategory,
  onSelectManualCategory,
  onRunOcr,
  onRunOcrOnRegion,
  onCleanRegion,
  onCleanAllRegions,
  onRevertRegion,
  onTranslateRegion,
  onTranslateAllRegions,
  onTypesetAllRegions,
  onClearTypesetting,
  customFonts = [],
  defaultFontFamily = 'sans-serif',
  onChangeDefaultFontFamily,
  onUploadFontFile,
  onRemoveCustomFont,
  fontUploadStatus,
  qcReport,
  onRunQc,
  onNextIssue,
  onPreviousIssue,
  currentIssueIndex = -1,
  selectedIssueId,
  onSelectIssue,
}) => {
  const [cleaningMethod, setCleaningMethod] = useState<CleaningMethod>('opencv-telea');
  const [padding, setPadding] = useState<number>(3);
  const [fillColor, setFillColor] = useState<string>('#ffffff');
  const [showLimitationsModal, setShowLimitationsModal] = useState<boolean>(false);
  const fontInputRef = useRef<HTMLInputElement>(null);

  if (!page) {
    return null;
  }

  const selectedRegion = page.regions.find((r) => r.id === selectedRegionId);

  const activeOptions: CleaningOptions = {
    method: cleaningMethod,
    padding,
    fillColor,
  };

  // STAGE 4: QC WORKSPACE PANEL
  if (activeStage === 'qc') {
    const summary = qcReport?.summary;
    const issues = qcReport?.issues || [];
    const hasReport = Boolean(qcReport);

    return (
      <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-auto lg:h-full shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-slate-100 text-sm">Quality Control (QC)</h2>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Action Bar: Run QC, Next Issue, Prev Issue */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              QC Controls
            </span>
            <button
              type="button"
              onClick={onRunQc}
              className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{hasReport ? 'Re-run QC' : 'Run QC'}</span>
            </button>

            {hasReport && issues.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 font-medium">
                  Issue {currentIssueIndex >= 0 ? currentIssueIndex + 1 : 0} of {issues.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onPreviousIssue}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                    title="Go to previous issue"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onNextIssue}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                    title="Go to next issue"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QC Summary Metrics Grid */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              QC Summary
            </span>

            {summary ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                  <span className="text-slate-400 text-[10px]">Total Regions</span>
                  <span className="text-slate-100 font-bold text-sm">{summary.totalRegions}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                  <span className="text-emerald-400 text-[10px]">Translated</span>
                  <span className="text-emerald-300 font-bold text-sm">{summary.translated}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                  <span className="text-amber-400 text-[10px]">Untranslated</span>
                  <span className="text-amber-300 font-bold text-sm">{summary.untranslated}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                  <span className="text-indigo-400 text-[10px]">Typeset</span>
                  <span className="text-indigo-300 font-bold text-sm">{summary.typeset}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                  <span className="text-slate-400 text-[10px]">Not Typeset</span>
                  <span className="text-slate-300 font-bold text-sm">{summary.notTypeset}</span>
                </div>
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30 flex flex-col">
                  <span className="text-amber-400 text-[10px]">Warnings</span>
                  <span className="text-amber-300 font-bold text-sm">{summary.warnings}</span>
                </div>
                <div className="col-span-2 p-2 bg-red-500/10 rounded-lg border border-red-500/30 flex flex-col">
                  <span className="text-red-400 text-[10px]">Errors</span>
                  <span className="text-red-300 font-bold text-sm">{summary.errors}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">
                Click "Run QC" to scan page regions for translation, typesetting, and cleaning issues.
              </p>
            )}
          </div>

          {/* Issues List */}
          {hasReport && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Detected Issues ({issues.length})
                </span>
              </div>

              {issues.length === 0 ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">All Quality Checks Passed!</span>
                  <span className="text-[11px] text-emerald-400/80">No errors or warnings found on this page.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {issues.map((issue, idx) => {
                    const isSelected = selectedIssueId === issue.id || (currentIssueIndex === idx && Boolean(selectedIssueId));
                    const isError = issue.severity === 'error';

                    return (
                      <div
                        key={issue.id}
                        onClick={() => onSelectIssue?.(issue)}
                        className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? isError
                              ? 'border-red-500 bg-red-950/40 text-slate-100 shadow-sm'
                              : 'border-amber-500 bg-amber-950/40 text-slate-100 shadow-sm'
                            : isError
                            ? 'border-red-500/30 bg-slate-950/60 text-slate-300 hover:border-red-500/60'
                            : 'border-amber-500/30 bg-slate-950/60 text-slate-300 hover:border-amber-500/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                                isError
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              }`}
                            >
                              {issue.severity}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                              {issue.category}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            #{issue.regionId.slice(-4)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-snug">{issue.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    );
  }

  // STAGE 3: TYPESETTING PANEL
  if (activeStage === 'typesetting') {
    const currentStyle = selectedRegion
      ? getEffectiveTypesettingStyle(selectedRegion, defaultFontFamily)
      : null;

    const handleAutoFitSelectedRegion = () => {
      if (!selectedRegion) return;
      const text = selectedRegion.translatedText || selectedRegion.translation || '';
      if (!text.trim()) return;

      const style = getEffectiveTypesettingStyle(selectedRegion, defaultFontFamily);
      const autoFit = calculateAutoFontSize(selectedRegion, text, style);

      onUpdateRegion({
        ...selectedRegion,
        typesetting: {
          ...selectedRegion.typesetting,
          fontSize: autoFit.fontSize,
        },
      });
    };

    const handleResetSelectedRegionStyle = () => {
      if (!selectedRegion) return;
      onUpdateRegion({
        ...selectedRegion,
        typesetting: undefined,
      });
    };

    const handleFontUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onUploadFontFile) {
        await onUploadFontFile(files[0]);
      }
      if (fontInputRef.current) {
        fontInputRef.current.value = '';
      }
    };

    return (
      <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-auto lg:h-full shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-slate-100 text-sm">Typesetting Studio</h2>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Custom Fonts Management Section */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Custom Fonts
              </span>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.zip"
                onChange={handleFontUploadChange}
                className="hidden"
                id="font-file-upload"
              />
              <button
                type="button"
                onClick={() => fontInputRef.current?.click()}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Font</span>
              </button>
            </div>

            {/* Status Message */}
            {fontUploadStatus && (
              <div
                className={`p-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                  fontUploadStatus.isError
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <span>{fontUploadStatus.message}</span>
              </div>
            )}

            {/* Default Font Family Dropdown */}
            <div className="flex flex-col gap-1">
              <label htmlFor="global-default-font" className="text-[11px] text-slate-400 font-medium">
                Global Default Font
              </label>
              <select
                id="global-default-font"
                value={defaultFontFamily}
                onChange={(e) => onChangeDefaultFontFamily?.(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <optgroup label="System Fonts">
                  {AVAILABLE_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                {customFonts.length > 0 && (
                  <optgroup label="Custom Uploaded Fonts">
                    {customFonts.map((font) => (
                      <option key={font.id} value={font.familyName}>
                        {font.displayName}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Registered Custom Fonts List */}
            {customFonts.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 font-medium">Uploaded Custom Fonts ({customFonts.length})</span>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {customFonts.map((font) => (
                    <div
                      key={font.id}
                      className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="truncate flex-1 pr-2">
                        <span className="font-medium text-slate-200 block truncate">{font.displayName}</span>
                        <span className="text-[10px] text-slate-500 font-mono block truncate">{font.fileName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveCustomFont?.(font.id)}
                        className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors cursor-pointer shrink-0"
                        title="Remove custom font"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bulk Actions for Typesetting */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Bulk Actions
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onTypesetAllRegions}
                disabled={page.regions.length === 0}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                title="Automatically typeset all regions with translated text"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Typeset All</span>
              </button>
              <button
                type="button"
                onClick={onClearTypesetting}
                disabled={page.regions.length === 0}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Clear all typesetting previews"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Selected Region Typesetting Editor */}
          {selectedRegion && currentStyle ? (
            <div className="bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-300">
                    Region #{selectedRegion.id.slice(-4)}
                  </span>
                  {selectedRegion.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium border border-slate-700">
                      {selectedRegion.category}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleResetSelectedRegionStyle}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                  title="Reset Style to Default"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Editable Translation */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-300 font-semibold">
                  Indonesian Translation
                </label>
                <textarea
                  rows={2}
                  value={selectedRegion.translatedText || selectedRegion.translation || ''}
                  onChange={(e) =>
                    onUpdateRegion({
                      ...selectedRegion,
                      translatedText: e.target.value,
                      translation: e.target.value,
                    })
                  }
                  className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="Enter translated text to typeset..."
                />
              </div>

              {/* Font Family Dropdown for Selected Region */}
              <div className="flex flex-col gap-1">
                <label htmlFor="region-font-family" className="text-[11px] text-slate-400 font-medium">
                  Font Family
                </label>
                <select
                  id="region-font-family"
                  value={selectedRegion.typesetting?.fontFamily ?? ''}
                  onChange={(e) =>
                    onUpdateRegion({
                      ...selectedRegion,
                      typesetting: {
                        ...selectedRegion.typesetting,
                        fontFamily: e.target.value ? e.target.value : undefined,
                      },
                    })
                  }
                  className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Use Default Font</option>
                  <optgroup label="System Fonts">
                    {AVAILABLE_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                  {customFonts.length > 0 && (
                    <optgroup label="Custom Fonts">
                      {customFonts.map((font) => (
                        <option key={font.id} value={font.familyName}>
                          {font.displayName}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Font Size & Auto Fit */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[11px] text-slate-300 font-medium">
                  <span>Font Size ({currentStyle.fontSize}px)</span>
                  <button
                    type="button"
                    onClick={handleAutoFitSelectedRegion}
                    className="text-[10px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 transition-colors cursor-pointer"
                  >
                    Auto Fit
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="8"
                    max="60"
                    value={currentStyle.fontSize}
                    onChange={(e) =>
                      onUpdateRegion({
                        ...selectedRegion,
                        typesetting: {
                          ...selectedRegion.typesetting,
                          fontSize: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1 accent-indigo-500 cursor-pointer"
                  />
                  <input
                    type="number"
                    min="8"
                    max="72"
                    value={currentStyle.fontSize}
                    onChange={(e) =>
                      onUpdateRegion({
                        ...selectedRegion,
                        typesetting: {
                          ...selectedRegion.typesetting,
                          fontSize: Number(e.target.value) || 12,
                        },
                      })
                    }
                    className="w-14 bg-slate-900 border border-slate-800 text-slate-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Alignment & Weight */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-medium">Alignment</label>
                  <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRegion({
                          ...selectedRegion,
                          typesetting: { ...selectedRegion.typesetting, align: 'left' },
                        })
                      }
                      className={`flex-1 p-1 rounded flex justify-center cursor-pointer ${
                        currentStyle.align === 'left' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Align Left"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRegion({
                          ...selectedRegion,
                          typesetting: { ...selectedRegion.typesetting, align: 'center' },
                        })
                      }
                      className={`flex-1 p-1 rounded flex justify-center cursor-pointer ${
                        currentStyle.align === 'center' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Align Center"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRegion({
                          ...selectedRegion,
                          typesetting: { ...selectedRegion.typesetting, align: 'right' },
                        })
                      }
                      className={`flex-1 p-1 rounded flex justify-center cursor-pointer ${
                        currentStyle.align === 'right' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Align Right"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-medium">Font Weight</label>
                  <select
                    value={String(currentStyle.fontWeight)}
                    onChange={(e) =>
                      onUpdateRegion({
                        ...selectedRegion,
                        typesetting: {
                          ...selectedRegion.typesetting,
                          fontWeight: e.target.value,
                        },
                      })
                    }
                    className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="600">Semi-Bold</option>
                  </select>
                </div>
              </div>

              {/* Text Color & Line Height */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-medium">Text Color</label>
                  <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <input
                      type="color"
                      value={currentStyle.color}
                      onChange={(e) =>
                        onUpdateRegion({
                          ...selectedRegion,
                          typesetting: { ...selectedRegion.typesetting, color: e.target.value },
                        })
                      }
                      className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={currentStyle.color}
                      onChange={(e) =>
                        onUpdateRegion({
                          ...selectedRegion,
                          typesetting: { ...selectedRegion.typesetting, color: e.target.value },
                        })
                      }
                      className="w-full bg-transparent text-slate-200 font-mono text-[10px] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                    <span>Line Height</span>
                    <span className="text-slate-300">{currentStyle.lineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.1"
                    value={currentStyle.lineHeight}
                    onChange={(e) =>
                      onUpdateRegion({
                        ...selectedRegion,
                        typesetting: {
                          ...selectedRegion.typesetting,
                          lineHeight: Number(e.target.value),
                        },
                      })
                    }
                    className="accent-indigo-500 cursor-pointer mt-1"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 text-center text-slate-400 text-xs">
              Select a text box on the canvas to customize its typesetting properties.
            </div>
          )}

          {/* Region Typesetting List */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Typeset Regions ({page.regions.length})
            </span>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {page.regions.map((region) => {
                const isSelected = region.id === selectedRegionId;
                const hasTranslation = Boolean(region.translatedText && region.translatedText.trim());

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
                        #{region.id.slice(-4)}
                      </span>
                      <span>{region.translatedText || region.text || '(empty region)'}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        hasTranslation
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {hasTranslation ? 'Ready' : 'Untranslated'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // STAGE 2: TRANSLATION PANEL
  if (activeStage === 'translation') {
    return (
      <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-auto lg:h-full shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Languages className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-slate-100 text-sm">Translation Studio</h2>
          </div>
          {page.isProcessing && (
            <span className="text-xs text-indigo-400 font-medium animate-pulse">
              {page.processingMessage || 'Translating...'}
            </span>
          )}
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Bulk Actions for Translation */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Bulk Actions
            </span>
            {onTranslateAllRegions && (
              <button
                onClick={onTranslateAllRegions}
                disabled={page.regions.length === 0 || page.isProcessing}
                className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>Translate All</span>
              </button>
            )}
          </div>

          {/* Selected Region Editor */}
          {selectedRegion ? (
            <div className="bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-300">
                    Region #{selectedRegion.id.slice(-4)}
                  </span>
                  {selectedRegion.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium border border-slate-700">
                      {selectedRegion.category}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onDeleteRegion(selectedRegion.id)}
                  className="p-1 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded transition-colors cursor-pointer"
                  title="Delete Region"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Read-Only Original Text */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-medium">Original Text</label>
                <textarea
                  rows={3}
                  readOnly
                  value={selectedRegion.text || ''}
                  className="bg-slate-950 border border-slate-800/80 text-slate-300 rounded-lg p-2 text-xs focus:outline-none cursor-not-allowed opacity-90"
                  placeholder="OCR Text output..."
                />
              </div>

              {/* Editable Translation */}
              <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-300 font-semibold">
                    Indonesian Translation
                  </label>
                  {onTranslateRegion && (
                    <button
                      onClick={() => onTranslateRegion(selectedRegion.id)}
                      disabled={page.isProcessing || !selectedRegion.text || !selectedRegion.text.trim()}
                      className="text-[10px] bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                      title="Translate text in this region to Indonesian"
                    >
                      <Languages className="w-3 h-3" />
                      <span>Translate</span>
                    </button>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={selectedRegion.translatedText || ''}
                  onChange={(e) =>
                    onUpdateRegion({
                      ...selectedRegion,
                      translatedText: e.target.value,
                      translation: e.target.value,
                    })
                  }
                  className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="Indonesian translation output..."
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 text-center text-slate-400 text-xs">
              Click any text box on the canvas to view and edit its translation.
            </div>
          )}

          {/* Region Translation Progress / List */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Translation Regions ({page.regions.length})
            </span>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {page.regions.map((region) => {
                const isSelected = region.id === selectedRegionId;
                const hasTranslation = Boolean(region.translatedText && region.translatedText.trim());

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
                        #{region.id.slice(-4)}
                      </span>
                      <span>{region.translatedText || region.text || '(empty region)'}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        hasTranslation
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {hasTranslation ? 'Translated' : 'Untranslated'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // STAGE 1: OCR & CLEANING PANEL (DEFAULT)
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
        {/* Detection Mode Selection Menu */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Detection Mode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectDetectionMode('auto');
                onRunOcr();
              }}
              disabled={page.isProcessing}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                detectionMode === 'auto'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              } disabled:opacity-50`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${page.isProcessing ? 'animate-spin' : ''}`} />
              <span>Automatic Detection</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectDetectionMode('manual')}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                detectionMode === 'manual'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual Selection</span>
            </button>
          </div>

          {/* Settings for Manual Selection */}
          {detectionMode === 'manual' && (
            <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-slate-800/80">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300 font-medium">Manual Selection Tool</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => onSelectManualTool?.('rectangle')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      manualTool === 'rectangle'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Rectangle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectManualTool?.('brush')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      manualTool === 'brush'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    <span>Brush</span>
                  </button>
                </div>
              </div>

              {manualTool === 'brush' && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>Brush Size</span>
                    <span className="text-slate-400">{brushSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={brushSize}
                    onChange={(e) => onSelectBrushSize?.(Number(e.target.value))}
                    className="accent-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1 mt-1">
                <label className="text-xs text-slate-300 font-medium">Default Manual Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => onSelectManualCategory(e.target.value as RegionCategory)}
                  className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="bubble-oval">Bubble Oval/Round</option>
                  <option value="bubble-rect">Bubble Square/Box</option>
                  <option value="text-outside">Floating Text (Outside Bubble)</option>
                  <option value="sfx">SFX (Sound Effects)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Bulk Actions
          </span>
          <button
            onClick={() => onCleanAllRegions(activeOptions)}
            disabled={page.regions.length === 0 || page.isProcessing}
            className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Clean All</span>
          </button>
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
              <option value="opencv-telea">OpenCV Telea (Inpaint)</option>
              <option value="lama">LaMa AI (Inpaint)</option>
              <option value="migan">MI-GAN AI (Inpaint)</option>
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
                    category: e.target.value as RegionCategory,
                  })
                }
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="bubble-oval">Bubble Oval/Round</option>
                <option value="bubble-rect">Bubble Square/Box</option>
                <option value="text-outside">Floating Text (Outside Bubble)</option>
                <option value="sfx">SFX (Sound Effects)</option>
              </select>
            </div>

            {/* Region Text Content */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400 font-medium">Original Text</label>
                {onRunOcrOnRegion && (
                  <button
                    onClick={() => onRunOcrOnRegion(selectedRegion.id)}
                    disabled={page.isProcessing}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Recognize text in this region with OCR"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Run OCR</span>
                  </button>
                )}
              </div>
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
