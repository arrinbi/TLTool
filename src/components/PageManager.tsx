import React, { useRef } from 'react';
import { Upload, FileImage, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ManhwaPage } from '../types';

interface PageManagerProps {
  pages: ManhwaPage[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onUploadPages: (files: FileList | File[]) => void;
  onDeletePage: (id: string) => void;
}

export const PageManager: React.FC<PageManagerProps> = ({
  pages,
  selectedPageId,
  onSelectPage,
  onUploadPages,
  onDeletePage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadPages(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadPages(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <aside className="w-full lg:w-72 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col h-auto lg:h-full shrink-0">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileImage className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-slate-100 text-sm">Pages ({pages.length})</h2>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload Drop Zone if Empty */}
      {pages.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="m-4 p-6 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
        >
          <Upload className="w-8 h-8 text-slate-400 mb-2" />
          <p className="text-xs font-medium text-slate-200 mb-1">
            Drag & drop manhwa pages
          </p>
          <p className="text-[11px] text-slate-400">
            or click to select PNG, JPG, WEBP
          </p>
        </div>
      ) : (
        /* Pages List / Grid */
        <div className="p-3 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
          {pages.map((page, index) => {
            const isSelected = page.id === selectedPageId;
            const cleanedCount = page.regions.filter((r) => r.isCleaned).length;
            const totalRegions = page.regions.length;

            return (
              <div
                key={page.id}
                onClick={() => onSelectPage(page.id)}
                className={`relative group rounded-lg p-2 border text-left transition-all cursor-pointer flex gap-3 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500'
                    : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/80'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-20 bg-slate-950 rounded overflow-hidden shrink-0 relative border border-slate-700/50">
                  <img
                    src={page.cleanedUrl || page.originalUrl}
                    alt={page.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1 left-1 bg-slate-950/80 text-[9px] font-bold text-slate-300 px-1 rounded">
                    #{index + 1}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <h3 className="text-xs font-medium text-slate-200 truncate" title={page.name}>
                      {page.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {page.width} × {page.height} px
                    </p>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      {totalRegions > 0 && cleanedCount === totalRegions ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                      )}
                      <span className="text-[10px]">
                        {totalRegions === 0
                          ? 'No regions'
                          : `${cleanedCount}/${totalRegions} cleaned`}
                      </span>
                    </span>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePage(page.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-slate-400 transition-all"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
