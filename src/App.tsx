import { useState, useEffect, useCallback } from 'react';
import type {
  ManhwaPage,
  TextRegion,
  CleaningOptions,
  WorkflowStage,
  BoundingBox,
  RegionCategory,
  ManualTool,
  CropRect,
} from './types';
import { HeaderToolbar } from './components/HeaderToolbar';
import { PageManager } from './components/PageManager';
import { MainWorkspace } from './components/MainWorkspace';
import { RegionInspector } from './components/RegionInspector';
import { AiSettingsModal } from './components/AiSettingsModal';
import { detectTextRegions, createOcrWorker } from './modules/ocr/ocrService';
import { cleanImageRegion, cleanAllRegions } from './modules/cleaning/cleaningService';
import { pushPageHistory, undoPageHistory, redoPageHistory } from './utils/history';
import { cropImageSource, transformRegionsForCrop } from './utils/cropUtils';

import type { AiConfig } from './modules/ai/aiTypes';
import { loadAiConfig, saveAiConfig } from './modules/ai/aiTypes';
import {
  recognizeText,
  translateRegion as translateRegionAi,
  translateAllRegions as translateAllRegionsAi,
} from './modules/ai/aiService';
import {
  renderTypesetImage,
  calculateAutoFontSize,
  getEffectiveTypesettingStyle,
} from './modules/typesetting/typesettingService';

export function App() {
  const [pages, setPages] = useState<ManhwaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<WorkflowStage>('ocr-cleaning');
  const [detectionMode, setDetectionMode] = useState<'auto' | 'manual'>('auto');
  const [manualTool, setManualTool] = useState<ManualTool>('rectangle');
  const [brushSize, setBrushSize] = useState<number>(15);
  const [manualCategory, setManualCategory] = useState<RegionCategory>('bubble-oval');
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);

  // AI Provider Config State
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState<boolean>(false);

  // Crop Tool State
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const handleSelectDetectionMode = useCallback((mode: 'auto' | 'manual') => {
    setDetectionMode(mode);
    if (mode === 'manual') {
      setIsDrawingMode(true);
    } else {
      setIsDrawingMode(false);
    }
  }, []);

  const handleSaveAiConfig = useCallback((newConfig: AiConfig) => {
    setAiConfig(newConfig);
    saveAiConfig(newConfig);
  }, []);

  // Load sample demo page if empty on start
  useEffect(() => {
    if (pages.length === 0) {
      const demoCanvas = document.createElement('canvas');
      demoCanvas.width = 600;
      demoCanvas.height = 900;
      const ctx = demoCanvas.getContext('2d');

      if (ctx) {
        // Draw sample comic background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 600, 900);

        // Panel 1
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(30, 30, 540, 380);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(180, 150, 100, 60, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('WHAT IS THIS?!', 130, 155);

        // Panel 2
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(30, 440, 540, 420);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(380, 600, 110, 70, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('THE MANHWA HAS', 310, 595);
        ctx.fillText('BEEN CLEANED!', 320, 620);

        demoCanvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const demoPage: ManhwaPage = {
              id: 'demo-page-1',
              name: 'Sample_Manhwa_Page_01.png',
              file: new File([blob], 'Sample_Manhwa_Page_01.png', { type: 'image/png' }),
              originalUrl: url,
              cleanedUrl: url,
              width: 600,
              height: 900,
              originalWidth: 600,
              originalHeight: 900,
              regions: [],
              history: [],
              historyIndex: -1,
              isProcessing: false,
            };

            setPages([demoPage]);
            setSelectedPageId('demo-page-1');
          }
        }, 'image/png');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;

  // Handle uploading multiple image files preserving native resolution
  const handleUploadPages = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newPages: ManhwaPage[] = [];

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue;

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const pageId = `page-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      const pageObj: ManhwaPage = {
        id: pageId,
        name: file.name,
        file,
        originalUrl: url,
        cleanedUrl: url,
        width: imgWidth,
        height: imgHeight,
        originalWidth: imgWidth,
        originalHeight: imgHeight,
        regions: [],
        history: [],
        historyIndex: -1,
        isProcessing: false,
      };

      newPages.push(pageObj);
    }

    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages]);
      setSelectedPageId(newPages[0].id);
    }
  }, []);

  // Run OCR on page
  const runTextDetectionOnPage = async (pageId: string, imageSource: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, isProcessing: true, processingMessage: 'Detecting text regions...' } : p
      )
    );

    try {
      const detected = await detectTextRegions(imageSource);
      const validDetected = detected.filter(
        (r) => r.bbox && r.bbox.width > 0 && r.bbox.height > 0
      );

      const autoRegions = validDetected.map((r) => ({
        ...r,
        text: r.text || '',
        isManual: false,
        source: 'auto' as const,
      }));

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const existingManual = p.regions.filter((r) => r.isManual || r.source === 'manual');
          return {
            ...p,
            regions: [...existingManual, ...autoRegions],
          };
        })
      );

      if (autoRegions.length > 0) {
        let worker: any = null;
        if (aiConfig.ocrProvider === 'tesseract') {
          try {
            worker = await createOcrWorker();
          } catch (wErr) {
            console.warn('Could not pre-initialize Tesseract worker:', wErr);
          }
        }

        try {
          for (let i = 0; i < autoRegions.length; i++) {
            const region = autoRegions[i];
            setPages((prev) =>
              prev.map((p) =>
                p.id === pageId
                  ? {
                      ...p,
                      processingMessage: `Recognizing text ${i + 1}/${autoRegions.length}...`,
                    }
                  : p
              )
            );

            try {
              const text = await recognizeText(
                { imageSource, bbox: region.bbox },
                aiConfig
              );
              setPages((prev) =>
                prev.map((p) => {
                  if (p.id !== pageId) return p;
                  return {
                    ...p,
                    regions: p.regions.map((r) =>
                      r.id === region.id ? { ...r, text: text !== undefined && text !== '' ? text : r.text } : r
                    ),
                  };
                })
              );
            } catch (regErr) {
              console.error(`Failed automatic OCR for region ${region.id}:`, regErr);
            }
          }
        } finally {
          if (worker) {
            try {
              await worker.terminate();
            } catch (tErr) {
              console.warn('Failed to terminate worker:', tErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to run text detection:', err);
    } finally {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                isProcessing: false,
                processingMessage: undefined,
              }
            : p
        )
      );
    }
  };

  const handleDeletePage = useCallback((pageId: string) => {
    setPages((prev) => {
      const remaining = prev.filter((p) => p.id !== pageId);
      if (selectedPageId === pageId) {
        setSelectedPageId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  }, [selectedPageId]);

  // OCR Single Region Text Recognition
  const handleRunOcrOnRegion = useCallback(async (regionId: string) => {
    if (!selectedPage) return;
    const targetRegion = selectedPage.regions.find((r) => r.id === regionId);
    if (!targetRegion) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true, processingMessage: 'Recognizing text...' } : p))
    );

    try {
      const imageSource = selectedPage.croppedUrl || selectedPage.originalUrl;
      const text = await recognizeText({ imageSource, bbox: targetRegion.bbox }, aiConfig);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          const updatedRegions = p.regions.map((r) => (r.id === regionId ? { ...r, text } : r));
          return { ...p, regions: updatedRegions, isProcessing: false, processingMessage: undefined };
        })
      );
    } catch (err) {
      console.error('Failed to recognize region text:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`OCR Error: ${errorMsg}`);
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false, processingMessage: undefined } : p))
      );
    }
  }, [selectedPage, aiConfig]);

  // Translation Handlers
  const handleTranslateRegion = useCallback(async (regionId: string) => {
    if (!selectedPage) return;
    const targetRegion = selectedPage.regions.find((r) => r.id === regionId);
    if (!targetRegion || !targetRegion.text || !targetRegion.text.trim()) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true, processingMessage: 'Translating region...' } : p))
    );

    try {
      const imageSource = selectedPage.croppedUrl || selectedPage.originalUrl;
      const translated = await translateRegionAi(targetRegion, imageSource, aiConfig);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          const updatedRegions = p.regions.map((r) =>
            r.id === regionId
              ? { ...r, translatedText: translated, translation: translated }
              : r
          );
          return { ...p, regions: updatedRegions, isProcessing: false, processingMessage: undefined };
        })
      );
    } catch (err) {
      console.error('Failed to translate region:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`Translation Error: ${errorMsg}`);
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false, processingMessage: undefined } : p))
      );
    }
  }, [selectedPage, aiConfig]);

  const handleTranslateAllRegions = useCallback(async () => {
    if (!selectedPage || selectedPage.regions.length === 0) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true, processingMessage: 'Translating all regions...' } : p))
    );

    try {
      const imageSource = selectedPage.croppedUrl || selectedPage.originalUrl;
      const batchResult = await translateAllRegionsAi(
        selectedPage.regions,
        imageSource,
        aiConfig,
        (completed, total) => {
          setPages((prev) =>
            prev.map((p) =>
              p.id === selectedPage.id
                ? { ...p, processingMessage: `Translating regions ${completed}/${total}...` }
                : p
            )
          );
        }
      );

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          return { ...p, regions: batchResult.updatedRegions, isProcessing: false, processingMessage: undefined };
        })
      );

      if (batchResult.failedRegionIds.length > 0) {
        const firstErr = Object.values(batchResult.errors)[0] || 'Unknown error';
        alert(`Translation completed with warnings. ${batchResult.failedRegionIds.length} region(s) failed:\n${firstErr}`);
      }
    } catch (err) {
      console.error('Failed to translate all regions:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`Translation Error: ${errorMsg}`);
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false, processingMessage: undefined } : p))
      );
    }
  }, [selectedPage, aiConfig]);

  // Region Operations
  const handleUpdateRegion = useCallback((updatedRegion: TextRegion) => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        const newRegions = p.regions.map((r) => (r.id === updatedRegion.id ? updatedRegion : r));
        return { ...p, regions: newRegions };
      })
    );
  }, [selectedPageId]);

  const handleAddRegion = useCallback(
    async (
      bbox: BoundingBox,
      category?: RegionCategory,
      extra?: {
        brushMask?: Uint8Array;
        isBrush?: boolean;
        brushPoints?: Array<{ x: number; y: number }>;
        brushSize?: number;
      }
    ) => {
      if (!selectedPageId) return;
      const targetPage = pages.find((p) => p.id === selectedPageId);
      if (!targetPage) return;

      const pageId = targetPage.id;
      const newRegion: TextRegion = {
        id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        bbox,
        text: '',
        confidence: 100,
        isCleaned: false,
        isManual: true,
        source: 'manual',
        category: category || 'bubble-oval',
        brushMask: extra?.brushMask,
        isBrush: extra?.isBrush,
        brushPoints: extra?.brushPoints,
        brushSize: extra?.brushSize,
      };

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            regions: [...p.regions, newRegion],
            isProcessing: true,
            processingMessage: 'Recognizing text...',
          };
        })
      );
      setSelectedRegionId(newRegion.id);

      const imageSource = targetPage.croppedUrl || targetPage.originalUrl;
      try {
        const text = await recognizeText({ imageSource, bbox: newRegion.bbox }, aiConfig);
        setPages((prev) =>
          prev.map((p) => {
            if (p.id !== pageId) return p;
            return {
              ...p,
              regions: p.regions.map((r) =>
                r.id === newRegion.id ? { ...r, text: text !== undefined ? text : r.text } : r
              ),
              isProcessing: false,
              processingMessage: undefined,
            };
          })
        );
      } catch (err) {
        console.error(`Failed automatic OCR for new manual region ${newRegion.id}:`, err);
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, isProcessing: false, processingMessage: undefined }
              : p
          )
        );
      }
    },
    [selectedPageId, pages, aiConfig]
  );

  const handleDeleteRegion = useCallback((regionId: string) => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        return { ...p, regions: p.regions.filter((r) => r.id !== regionId) };
      })
    );
    if (selectedRegionId === regionId) {
      setSelectedRegionId(null);
    }
  }, [selectedPageId, selectedRegionId]);

  // Clean single region
  const handleCleanRegion = useCallback(async (regionId: string, options: CleaningOptions) => {
    if (!selectedPage) return;
    const targetRegion = selectedPage.regions.find((r) => r.id === regionId);
    if (!targetRegion) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true } : p))
    );

    const effectiveOptions: CleaningOptions = {
      ...options,
      isManualRegion: options.isManualRegion ?? targetRegion.isManual,
      category: targetRegion.category,
      brushMask: targetRegion.brushMask,
      isBrush: targetRegion.isBrush,
      brushPoints: targetRegion.brushPoints,
      brushSize: targetRegion.brushSize,
    };

    try {
      const newCleanedUrl = await cleanImageRegion(selectedPage.cleanedUrl, targetRegion.bbox, effectiveOptions);
      const updatedRegions = selectedPage.regions.map((r) =>
        r.id === regionId ? { ...r, isCleaned: true, cleaningMethod: options.method } : r
      );

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          const updatedPage = pushPageHistory(
            { ...p, isProcessing: false },
            newCleanedUrl,
            updatedRegions,
            `Clean region ${regionId}`
          );
          return updatedPage;
        })
      );
      if (selectedRegionId === regionId) {
        setSelectedRegionId(null);
      }
    } catch (err) {
      console.error('Cleaning failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`Cleaning Error: ${errorMsg}`);
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false } : p))
      );
    }
  }, [selectedPage, selectedRegionId]);

  // Clean all regions in pass
  const handleCleanAllRegions = useCallback(async (options: CleaningOptions) => {
    if (!selectedPage || selectedPage.regions.length === 0) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true } : p))
    );

    try {
      const newCleanedUrl = await cleanAllRegions(selectedPage.cleanedUrl, selectedPage.regions, options);
      const updatedRegions = selectedPage.regions.map((r) => ({
        ...r,
        isCleaned: true,
        cleaningMethod: options.method,
      }));

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          const updatedPage = pushPageHistory(
            { ...p, isProcessing: false },
            newCleanedUrl,
            updatedRegions,
            'Clean all regions'
          );
          return updatedPage;
        })
      );
      setSelectedRegionId(null);
    } catch (err) {
      console.error('Bulk cleaning failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`Cleaning Error: ${errorMsg}`);
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false } : p))
      );
    }
  }, [selectedPage]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (!selectedPage) return;
    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? undoPageHistory(p) : p))
    );
  }, [selectedPage]);

  const handleRedo = useCallback(() => {
    if (!selectedPage) return;
    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? redoPageHistory(p) : p))
    );
  }, [selectedPage]);

  const canUndo = selectedPage ? selectedPage.historyIndex >= 0 : false;
  const canRedo = selectedPage ? selectedPage.historyIndex < selectedPage.history.length - 1 : false;

  // Revert specific region
  const handleRevertRegion = useCallback((regionId: string) => {
    if (!selectedPage) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPage.id) return p;
        const updatedRegions = p.regions.map((r) =>
          r.id === regionId ? { ...r, isCleaned: false } : r
        );
        return { ...p, regions: updatedRegions };
      })
    );
  }, [selectedPage]);

  // Crop Tool Handlers
  const handleToggleCropMode = useCallback(() => {
    if (!selectedPage) return;

    if (isCropMode) {
      setIsCropMode(false);
      setCropRect(null);
    } else {
      setIsCropMode(true);
      setCropRect({
        x: 0,
        y: 0,
        width: selectedPage.width,
        height: selectedPage.height,
      });
    }
  }, [isCropMode, selectedPage]);

  const handleResetCropRect = useCallback(() => {
    if (!selectedPage) return;
    setCropRect({
      x: 0,
      y: 0,
      width: selectedPage.width,
      height: selectedPage.height,
    });
  }, [selectedPage]);

  const handleCancelCrop = useCallback(() => {
    setIsCropMode(false);
    setCropRect(null);
  }, []);

  const handleApplyCrop = useCallback(async () => {
    if (!selectedPage || !cropRect) return;

    if (cropRect.width < 10 || cropRect.height < 10) {
      alert('Crop area is too small. Please select a larger crop rectangle.');
      return;
    }

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true, processingMessage: 'Cropping page...' } : p))
    );

    try {
      const baseSource = selectedPage.croppedUrl || selectedPage.originalUrl;
      const [newCleanedUrl, newCroppedUrl] = await Promise.all([
        cropImageSource(selectedPage.cleanedUrl, cropRect),
        cropImageSource(baseSource, cropRect),
      ]);

      const newRegions = transformRegionsForCrop(selectedPage.regions, cropRect);

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPage.id) return p;
          return pushPageHistory(
            { ...p, isProcessing: false, processingMessage: undefined },
            newCleanedUrl,
            newRegions,
            'Crop page',
            {
              croppedUrl: newCroppedUrl,
              width: cropRect.width,
              height: cropRect.height,
            }
          );
        })
      );

      setIsCropMode(false);
      setCropRect(null);
      setSelectedRegionId(null);
    } catch (err) {
      console.error('Failed to crop page:', err);
      alert('Failed to crop page.');
      setPages((prev) =>
        prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: false, processingMessage: undefined } : p))
      );
    }
  }, [selectedPage, cropRect]);

  // Typesetting Handlers
  const handleTypesetAllRegions = useCallback(() => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        const updatedRegions = p.regions.map((region) => {
          const text = region.translatedText || region.translation;
          if (!text || !text.trim()) return region;

          const style = getEffectiveTypesettingStyle(region);
          const autoFit = calculateAutoFontSize(region, text, style);

          return {
            ...region,
            typesetting: {
              ...region.typesetting,
              fontFamily: style.fontFamily,
              fontSize: autoFit.fontSize,
              color: style.color,
              align: style.align,
              lineHeight: style.lineHeight,
              fontWeight: style.fontWeight,
            },
          };
        });
        return { ...p, regions: updatedRegions };
      })
    );
  }, [selectedPageId]);

  const handleClearTypesetting = useCallback(() => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        const updatedRegions = p.regions.map((region) => ({
          ...region,
          typesetting: undefined,
        }));
        return { ...p, regions: updatedRegions };
      })
    );
  }, [selectedPageId]);

  const handleExportTypesetImage = useCallback(async () => {
    if (!selectedPage) return;
    try {
      const typesetDataUrl = await renderTypesetImage(selectedPage.cleanedUrl, selectedPage.regions);
      const a = document.createElement('a');
      a.href = typesetDataUrl;
      a.download = `typeset_${selectedPage.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export typeset image:', err);
      alert('Failed to export typeset image.');
    }
  }, [selectedPage]);

  // Export handlers
  const handleExportCleanedImage = useCallback(() => {
    if (!selectedPage) return;
    const a = document.createElement('a');
    a.href = selectedPage.cleanedUrl;
    a.download = `cleaned_${selectedPage.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [selectedPage]);

  const handleExportAllPages = useCallback(() => {
    pages.forEach((p, idx) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = p.cleanedUrl;
        a.download = `cleaned_${p.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, idx * 300);
    });
  }, [pages]);

  const handleExportProjectJson = useCallback(() => {
    const projectData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        regions: p.regions,
      })),
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manhwa_translation_project.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [pages]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* Header Bar */}
      <HeaderToolbar
        pages={pages}
        selectedPage={selectedPage}
        activeStage={activeStage}
        onStageSelect={setActiveStage}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onExportCleanedImage={handleExportCleanedImage}
        onExportTypesetImage={handleExportTypesetImage}
        onExportAllPages={handleExportAllPages}
        onExportProjectJson={handleExportProjectJson}
        onOpenAiSettings={() => setIsAiSettingsOpen(true)}
      />

      {/* Main Studio Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Sidebar Left: Pages Manager */}
        <PageManager
          pages={pages}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onUploadPages={handleUploadPages}
          onDeletePage={handleDeletePage}
        />

        {/* Center: Image Canvas Workspace */}
        <MainWorkspace
          page={selectedPage}
          selectedRegionId={selectedRegionId}
          activeStage={activeStage}
          onSelectRegion={setSelectedRegionId}
          onUpdateRegion={handleUpdateRegion}
          onAddRegion={handleAddRegion}
          onDeleteRegion={handleDeleteRegion}
          detectionMode={detectionMode}
          onSelectDetectionMode={handleSelectDetectionMode}
          manualTool={manualTool}
          onSelectManualTool={setManualTool}
          brushSize={brushSize}
          onSelectBrushSize={setBrushSize}
          manualCategory={manualCategory}
          onSelectManualCategory={setManualCategory}
          isDrawingMode={isDrawingMode}
          setIsDrawingMode={setIsDrawingMode}
          onRunOcr={() =>
            selectedPage &&
            runTextDetectionOnPage(
              selectedPage.id,
              selectedPage.croppedUrl || selectedPage.originalUrl
            )
          }
          isCropMode={isCropMode}
          onToggleCropMode={handleToggleCropMode}
          cropRect={cropRect}
          onChangeCropRect={setCropRect}
          onApplyCrop={handleApplyCrop}
          onCancelCrop={handleCancelCrop}
          onResetCropRect={handleResetCropRect}
        />

        {/* Sidebar Right: Region Inspector & Cleaning Options */}
        <RegionInspector
          page={selectedPage}
          selectedRegionId={selectedRegionId}
          activeStage={activeStage}
          onSelectRegion={setSelectedRegionId}
          onUpdateRegion={handleUpdateRegion}
          onDeleteRegion={handleDeleteRegion}
          detectionMode={detectionMode}
          onSelectDetectionMode={handleSelectDetectionMode}
          manualTool={manualTool}
          onSelectManualTool={setManualTool}
          brushSize={brushSize}
          onSelectBrushSize={setBrushSize}
          manualCategory={manualCategory}
          onSelectManualCategory={setManualCategory}
          onRunOcr={() =>
            selectedPage &&
            runTextDetectionOnPage(
              selectedPage.id,
              selectedPage.croppedUrl || selectedPage.originalUrl
            )
          }
          onRunOcrOnRegion={handleRunOcrOnRegion}
          onCleanRegion={handleCleanRegion}
          onCleanAllRegions={handleCleanAllRegions}
          onRevertRegion={handleRevertRegion}
          onTranslateRegion={handleTranslateRegion}
          onTranslateAllRegions={handleTranslateAllRegions}
          onTypesetAllRegions={handleTypesetAllRegions}
          onClearTypesetting={handleClearTypesetting}
        />
      </div>

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
        config={aiConfig}
        onSaveConfig={handleSaveAiConfig}
      />
    </div>
  );
}

export default App;
