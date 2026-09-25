import { useState, useEffect, useCallback } from 'react';
import type {
  ManhwaPage,
  TextRegion,
  CleaningOptions,
  WorkflowStage,
  BoundingBox,
} from './types';
import { HeaderToolbar } from './components/HeaderToolbar';
import { PageManager } from './components/PageManager';
import { MainWorkspace } from './components/MainWorkspace';
import { RegionInspector } from './components/RegionInspector';
import { detectTextRegions } from './modules/ocr/ocrService';
import { cleanImageRegion, cleanAllRegions } from './modules/cleaning/cleaningService';
import { pushPageHistory, undoPageHistory, redoPageHistory } from './utils/history';

export function App() {
  const [pages, setPages] = useState<ManhwaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<WorkflowStage>('ocr-cleaning');

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
              regions: [
                {
                  id: 'region-demo-1',
                  bbox: { x: 80, y: 90, width: 200, height: 120 },
                  text: 'WHAT IS THIS?!',
                  confidence: 98,
                  isCleaned: false,
                },
                {
                  id: 'region-demo-2',
                  bbox: { x: 270, y: 530, width: 220, height: 140 },
                  text: 'THE MANHWA HAS\nBEEN CLEANED!',
                  confidence: 96,
                  isCleaned: false,
                },
              ],
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
      const pageObj: ManhwaPage = {
        id: pageId,
        name: file.name,
        file,
        originalUrl: url,
        cleanedUrl: url,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
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

      // Auto run text detection on newly uploaded pages
      for (const p of newPages) {
        runTextDetectionOnPage(p.id, p.originalUrl);
      }
    }
  }, []);

  // Run OCR on page
  const runTextDetectionOnPage = async (pageId: string, imageSource: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, isProcessing: true, processingMessage: 'Detecting text...' } : p
      )
    );

    const regions = await detectTextRegions(imageSource);

    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? {
              ...p,
              regions,
              isProcessing: false,
              processingMessage: undefined,
            }
          : p
      )
    );
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

  const handleAddRegion = useCallback((bbox: BoundingBox) => {
    if (!selectedPageId) return;
    const newRegion: TextRegion = {
      id: `region-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      bbox,
      text: '',
      confidence: 100,
      isCleaned: false,
    };

    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        return { ...p, regions: [...p.regions, newRegion] };
      })
    );
    setSelectedRegionId(newRegion.id);
  }, [selectedPageId]);

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

    const newCleanedUrl = await cleanImageRegion(selectedPage.cleanedUrl, targetRegion.bbox, options);
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
  }, [selectedPage]);

  // Clean all regions in pass
  const handleCleanAllRegions = useCallback(async (options: CleaningOptions) => {
    if (!selectedPage || selectedPage.regions.length === 0) return;

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, isProcessing: true } : p))
    );

    const uncleanedBoxes = selectedPage.regions.map((r) => r.bbox);
    const newCleanedUrl = await cleanAllRegions(selectedPage.cleanedUrl, uncleanedBoxes, options);
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
        onExportAllPages={handleExportAllPages}
        onExportProjectJson={handleExportProjectJson}
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
          onSelectRegion={setSelectedRegionId}
          onUpdateRegion={handleUpdateRegion}
          onAddRegion={handleAddRegion}
          onDeleteRegion={handleDeleteRegion}
        />

        {/* Sidebar Right: Region Inspector & Cleaning Options */}
        <RegionInspector
          page={selectedPage}
          selectedRegionId={selectedRegionId}
          onSelectRegion={setSelectedRegionId}
          onUpdateRegion={handleUpdateRegion}
          onDeleteRegion={handleDeleteRegion}
          onRunOcr={() =>
            selectedPage && runTextDetectionOnPage(selectedPage.id, selectedPage.originalUrl)
          }
          onCleanRegion={handleCleanRegion}
          onCleanAllRegions={handleCleanAllRegions}
          onRevertRegion={handleRevertRegion}
        />
      </div>
    </div>
  );
}

export default App;
