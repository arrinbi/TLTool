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
import {
  detectTextRegions,
  detectBubbleRegions,
  associateTextWithBubbles,
  deduplicateOrUpdateRegions,
  createOcrWorker,
} from './modules/ocr/ocrService';
import { cleanImageRegion, cleanAllRegions } from './modules/cleaning/cleaningService';
import { pushPageHistory, undoPageHistory, redoPageHistory } from './utils/history';
import { cropImageSource, transformRegionsForCrop } from './utils/cropUtils';
import { subtractEraserFromRegion } from './utils/brushUtils';

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
import type { CustomFont } from './modules/typesetting/fontService';
import { processFontUpload, unregisterCustomFont } from './modules/typesetting/fontService';

import type { QcReport, QcIssue } from './modules/qc/qcService';
import { runQualityControl } from './modules/qc/qcService';
import { exportPagesAsPdf, exportPagesAsZip } from './modules/export/exportService';
import { ShieldCheck, AlertTriangle, AlertCircle, X, Download } from 'lucide-react';

export function App() {
  const [pages, setPages] = useState<ManhwaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<WorkflowStage>('ocr');
  const [detectionMode, setDetectionMode] = useState<'auto' | 'manual'>('auto');
  const [manualTool, setManualTool] = useState<ManualTool>('rectangle');
  const [brushSize, setBrushSize] = useState<number>(15);
  const [manualCategory, setManualCategory] = useState<RegionCategory>('bubble-oval');
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);

  // Custom Font Management State
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [defaultFontFamily, setDefaultFontFamily] = useState<string>('sans-serif');
  const [fontUploadStatus, setFontUploadStatus] = useState<{ message: string; isError?: boolean } | null>(null);

  // AI Provider Config State
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState<boolean>(false);

  // Crop Tool State
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  // QC State
  const [qcReports, setQcReports] = useState<Record<string, QcReport>>({});
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number>(-1);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Export Safeguard Modal State
  const [isExportSafeguardOpen, setIsExportSafeguardOpen] = useState<boolean>(false);
  const [pendingExportCallback, setPendingExportCallback] = useState<(() => void) | null>(null);
  const [exportSafeguardNotice, setExportSafeguardNotice] = useState<{
    title: string;
    body: string;
    severity: 'error' | 'warning' | 'unrun';
  } | null>(null);

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

  // Custom Font Upload & Cleanup Handlers
  const handleUploadFontFile = useCallback(async (file: File) => {
    const res = await processFontUpload(file, customFonts);
    if (res.fonts.length > 0) {
      setCustomFonts((prev) => [...prev, ...res.fonts]);
    }
    setFontUploadStatus({ message: res.statusMessage, isError: res.error });
    return res;
  }, [customFonts]);

  const handleRemoveCustomFont = useCallback((fontId: string) => {
    const targetFont = customFonts.find((f) => f.id === fontId);
    if (!targetFont) return;

    unregisterCustomFont(fontId);
    setCustomFonts((prev) => prev.filter((f) => f.id !== fontId));

    if (defaultFontFamily === targetFont.familyName) {
      setDefaultFontFamily('sans-serif');
    }

    setPages((prevPages) =>
      prevPages.map((p) => ({
        ...p,
        regions: p.regions.map((r) =>
          r.typesetting?.fontFamily === targetFont.familyName
            ? { ...r, typesetting: { ...r.typesetting, fontFamily: undefined } }
            : r
        ),
      }))
    );
  }, [customFonts, defaultFontFamily]);

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
              bubbles: [],
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

  // Clear region selection overlay when entering Cleaning stage
  useEffect(() => {
    if (activeStage === 'cleaning') {
      setSelectedRegionId(null);
    }
  }, [activeStage]);

  // Run QC Analysis
  const handleRunQc = useCallback(() => {
    if (!selectedPage) return;
    const report = runQualityControl(selectedPage, defaultFontFamily);
    setQcReports((prev) => ({ ...prev, [selectedPage.id]: report }));

    if (report.issues.length > 0) {
      setCurrentIssueIndex(0);
      setSelectedIssueId(report.issues[0].id);
      setSelectedRegionId(report.issues[0].regionId);
    } else {
      setCurrentIssueIndex(-1);
      setSelectedIssueId(null);
    }
  }, [selectedPage, defaultFontFamily]);

  // Auto-run QC when entering QC stage if not already run
  useEffect(() => {
    if (activeStage === 'qc' && selectedPage && !qcReports[selectedPage.id]) {
      handleRunQc();
    }
  }, [activeStage, selectedPage, qcReports, handleRunQc]);

  // QC Navigation
  const handleNextIssue = useCallback(() => {
    if (!selectedPage) return;
    const report = qcReports[selectedPage.id];
    if (!report || report.issues.length === 0) return;

    const nextIndex = (currentIssueIndex + 1) % report.issues.length;
    const targetIssue = report.issues[nextIndex];

    setCurrentIssueIndex(nextIndex);
    setSelectedIssueId(targetIssue.id);
    setSelectedRegionId(targetIssue.regionId);
  }, [selectedPage, qcReports, currentIssueIndex]);

  const handlePreviousIssue = useCallback(() => {
    if (!selectedPage) return;
    const report = qcReports[selectedPage.id];
    if (!report || report.issues.length === 0) return;

    const prevIndex = (currentIssueIndex - 1 + report.issues.length) % report.issues.length;
    const targetIssue = report.issues[prevIndex];

    setCurrentIssueIndex(prevIndex);
    setSelectedIssueId(targetIssue.id);
    setSelectedRegionId(targetIssue.regionId);
  }, [selectedPage, qcReports, currentIssueIndex]);

  const handleSelectIssue = useCallback((issue: QcIssue) => {
    if (!selectedPage) return;
    const report = qcReports[selectedPage.id];
    if (!report) return;

    const idx = report.issues.findIndex((i) => i.id === issue.id);
    setCurrentIssueIndex(idx >= 0 ? idx : -1);
    setSelectedIssueId(issue.id);
    setSelectedRegionId(issue.regionId);
  }, [selectedPage, qcReports]);

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
        bubbles: [],
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

  // Run Bubble Detection on page (creates BubbleRegions without creating TextRegions)
  const runBubbleDetectionOnPage = async (pageId: string, imageSource: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, isProcessing: true, processingMessage: 'Detecting speech bubbles...' } : p
      )
    );

    try {
      const detectedBubbles = await detectBubbleRegions(imageSource);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const updatedRegions = associateTextWithBubbles(p.regions, detectedBubbles);
          return {
            ...p,
            bubbles: detectedBubbles,
            regions: updatedRegions,
          };
        })
      );
    } catch (err) {
      console.error('Failed to detect bubbles:', err);
    } finally {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId ? { ...p, isProcessing: false, processingMessage: undefined } : p
        )
      );
    }
  };

  // Run OCR on page (uses deduplicateOrUpdateRegions to prevent duplicate regions)
  const runTextDetectionOnPage = async (pageId: string, imageSource: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, isProcessing: true, processingMessage: 'Detecting text regions...' } : p
      )
    );

    try {
      const currentPage = pages.find((p) => p.id === pageId);
      const existingBubbles = currentPage?.bubbles || [];

      const detected = await detectTextRegions(imageSource);
      const validDetected = detected.filter(
        (r) => r.bbox && r.bbox.width > 0 && r.bbox.height > 0
      );

      let autoRegions: TextRegion[] = validDetected.map((r) => ({
        ...r,
        text: r.text || '',
        isManual: false,
        source: 'auto' as const,
      }));

      if (existingBubbles.length > 0) {
        autoRegions = associateTextWithBubbles(autoRegions, existingBubbles);
      }

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const existingManual = p.regions.filter((r) => r.isManual || r.source === 'manual');
          const existingAuto = p.regions.filter((r) => !r.isManual && r.source !== 'manual');

          // Deduplicate/update new auto regions against existing auto regions
          const mergedAuto = deduplicateOrUpdateRegions(existingAuto, autoRegions);

          return {
            ...p,
            regions: [...existingManual, ...mergedAuto],
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

  // Eraser Mask Handler: Subtracts eraser stroke from region mask without deleting TextRegions, without modifying text, and without running OCR
  const handleEraseMask = useCallback(
    (points: Array<{ x: number; y: number }>, size: number) => {
      if (!selectedPageId || points.length === 0) return;
      const targetPage = pages.find((p) => p.id === selectedPageId);
      if (!targetPage) return;

      const updatedRegions = targetPage.regions.map((region) => {
        if (region.isCleaned) return region;
        if (selectedRegionId && region.id !== selectedRegionId) return region;

        return subtractEraserFromRegion(
          region,
          points,
          size,
          targetPage.width,
          targetPage.height
        );
      });

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPageId) return p;
          return { ...p, regions: updatedRegions };
        })
      );
    },
    [selectedPageId, selectedRegionId, pages]
  );

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

      if (activeStage === 'cleaning') {
        // Cleaning Stage: Drawing a temporary selection executes cleaning on targetPage.cleanedUrl directly
        // without creating or appending new TextRegions to targetPage.regions.
        const effectiveOptions: CleaningOptions = {
          method: 'opencv-telea',
          padding: 3,
          isManualRegion: true,
          category: category || manualCategory,
          brushMask: extra?.brushMask,
          isBrush: extra?.isBrush,
          brushPoints: extra?.brushPoints,
          brushSize: extra?.brushSize || brushSize,
        };

        setPages((prev) =>
          prev.map((p) => (p.id === targetPage.id ? { ...p, isProcessing: true, processingMessage: 'Cleaning selection...' } : p))
        );

        try {
          const newCleanedUrl = await cleanImageRegion(targetPage.cleanedUrl, bbox, effectiveOptions);
          setPages((prev) =>
            prev.map((p) => {
              if (p.id !== targetPage.id) return p;
              return pushPageHistory(
                { ...p, isProcessing: false, processingMessage: undefined },
                newCleanedUrl,
                p.regions, // Keep persistent OCR TextRegions unchanged
                'Clean manual selection'
              );
            })
          );
        } catch (err) {
          console.error('Manual selection cleaning failed:', err);
          setPages((prev) =>
            prev.map((p) => (p.id === targetPage.id ? { ...p, isProcessing: false, processingMessage: undefined } : p))
          );
        }
        return;
      }

      // Stage 1 (OCR Stage): Adds a new manual TextRegion to the OCR dataset and runs OCR recognition
      const pageId = targetPage.id;
      const newRegion: TextRegion = {
        id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        bbox,
        text: '',
        confidence: 100,
        isCleaned: false,
        isManual: true,
        source: 'manual',
        category: category || manualCategory,
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
    [selectedPageId, pages, aiConfig, activeStage, manualCategory, brushSize, selectedRegionId]
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

  // Clean single region - strictly modifies cleaned image and region cleaning state without modifying OCR text or running OCR
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

  // Clean all regions - strictly modifies cleaned image and region cleaning state without modifying OCR text or running OCR
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

          const style = getEffectiveTypesettingStyle(region, defaultFontFamily);
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
  }, [selectedPageId, defaultFontFamily]);

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

  const handleRawExportTypesetImage = useCallback(async () => {
    if (!selectedPage) return;
    try {
      const typesetDataUrl = await renderTypesetImage(
        selectedPage.cleanedUrl,
        selectedPage.regions,
        defaultFontFamily
      );
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
  }, [selectedPage, defaultFontFamily]);

  // Raw Export Handlers
  const handleRawExportCleanedImage = useCallback(() => {
    if (!selectedPage) return;
    const a = document.createElement('a');
    a.href = selectedPage.cleanedUrl;
    a.download = `cleaned_${selectedPage.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [selectedPage]);

  // PDF and ZIP Export Handlers
  const handleExportAllPagesPdf = useCallback(async () => {
    if (pages.length === 0) return;
    try {
      await exportPagesAsPdf(pages, defaultFontFamily);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to export PDF.');
    }
  }, [pages, defaultFontFamily]);

  const handleExportAllPagesZip = useCallback(async () => {
    if (pages.length === 0) return;
    try {
      await exportPagesAsZip(pages, defaultFontFamily);
    } catch (err) {
      console.error('Failed to export ZIP:', err);
      alert('Failed to export ZIP.');
    }
  }, [pages, defaultFontFamily]);

  const handleRawExportAllPages = useCallback(() => {
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

  const handleRawExportProjectJson = useCallback(() => {
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

  // Export Safeguard Evaluator
  const executeWithExportSafeguard = useCallback((exportCallback: () => void) => {
    if (!selectedPage) return;

    const report = qcReports[selectedPage.id];

    if (!report) {
      setExportSafeguardNotice({
        title: 'QC Analysis Not Run',
        body: 'Quality Control (QC) analysis has not been run for this page yet. It is recommended to check page quality before exporting.',
        severity: 'unrun',
      });
      setPendingExportCallback(() => exportCallback);
      setIsExportSafeguardOpen(true);
    } else if (report.summary.errors > 0) {
      setExportSafeguardNotice({
        title: 'QC Critical Errors Found',
        body: `QC found ${report.summary.errors} critical error(s) and ${report.summary.warnings} warning(s) on this page.`,
        severity: 'error',
      });
      setPendingExportCallback(() => exportCallback);
      setIsExportSafeguardOpen(true);
    } else if (report.summary.warnings > 0) {
      setExportSafeguardNotice({
        title: 'QC Warnings Found',
        body: `QC found ${report.summary.warnings} warning(s) on this page.`,
        severity: 'warning',
      });
      setPendingExportCallback(() => exportCallback);
      setIsExportSafeguardOpen(true);
    } else {
      exportCallback();
    }
  }, [selectedPage, qcReports]);

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
        onExportCleanedImage={() => executeWithExportSafeguard(handleRawExportCleanedImage)}
        onExportTypesetImage={() => executeWithExportSafeguard(handleRawExportTypesetImage)}
        onExportAllPages={() => executeWithExportSafeguard(handleRawExportAllPages)}
        onExportAllPagesPdf={() => executeWithExportSafeguard(handleExportAllPagesPdf)}
        onExportAllPagesZip={() => executeWithExportSafeguard(handleExportAllPagesZip)}
        onExportProjectJson={() => executeWithExportSafeguard(handleRawExportProjectJson)}
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
          onEraseMask={handleEraseMask}
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
          defaultFontFamily={defaultFontFamily}
          qcReport={selectedPage ? qcReports[selectedPage.id] : null}
        />

        {/* Sidebar Right: Region Inspector & Cleaning Options */}
        <RegionInspector
          page={selectedPage}
          pages={pages}
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
          onRunBubbleDetection={() =>
            selectedPage &&
            runBubbleDetectionOnPage(
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
          aiConfig={aiConfig}
          onChangeAiConfig={handleSaveAiConfig}
          customFonts={customFonts}
          defaultFontFamily={defaultFontFamily}
          onChangeDefaultFontFamily={setDefaultFontFamily}
          onUploadFontFile={handleUploadFontFile}
          onRemoveCustomFont={handleRemoveCustomFont}
          fontUploadStatus={fontUploadStatus}
          qcReport={selectedPage ? qcReports[selectedPage.id] : null}
          onRunQc={handleRunQc}
          onNextIssue={handleNextIssue}
          onPreviousIssue={handlePreviousIssue}
          currentIssueIndex={currentIssueIndex}
          selectedIssueId={selectedIssueId}
          onSelectIssue={handleSelectIssue}
          onExportPdf={() => executeWithExportSafeguard(handleExportAllPagesPdf)}
          onExportZip={() => executeWithExportSafeguard(handleExportAllPagesZip)}
          onExportSinglePagePdf={() => executeWithExportSafeguard(async () => {
            if (selectedPage) {
              await exportPagesAsPdf([selectedPage], defaultFontFamily);
            }
          })}
          onExportSinglePagePng={() => executeWithExportSafeguard(handleRawExportTypesetImage)}
          onNavigateToStage={setActiveStage}
        />
      </div>

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
        config={aiConfig}
        onSaveConfig={handleSaveAiConfig}
      />

      {/* Export Safeguard Warning Modal */}
      {isExportSafeguardOpen && exportSafeguardNotice && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 relative shadow-2xl flex flex-col gap-4">
            <button
              onClick={() => {
                setIsExportSafeguardOpen(false);
                setPendingExportCallback(null);
              }}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  exportSafeguardNotice.severity === 'error'
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : exportSafeguardNotice.severity === 'warning'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                }`}
              >
                {exportSafeguardNotice.severity === 'error' ? (
                  <AlertCircle className="w-6 h-6" />
                ) : exportSafeguardNotice.severity === 'warning' ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <ShieldCheck className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">{exportSafeguardNotice.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">{exportSafeguardNotice.body}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              {exportSafeguardNotice.severity === 'error'
                ? 'Critical QC errors should be resolved in Stage 4 to prevent corrupted output or missing translations.'
                : exportSafeguardNotice.severity === 'warning'
                ? 'QC warnings indicate potential formatting or cleaning flaws. You can review them in Stage 4 or proceed anyway.'
                : 'QC analysis scans for missing translations, uncleaned text, and typesetting flaws.'}
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsExportSafeguardOpen(false);
                  setPendingExportCallback(null);
                  setActiveStage('qc');
                  handleRunQc();
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Cancel & Run QC</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsExportSafeguardOpen(false);
                  if (pendingExportCallback) {
                    pendingExportCallback();
                    setPendingExportCallback(null);
                  }
                }}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              >
                <Download className="w-4 h-4" />
                <span>Export Anyway</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
