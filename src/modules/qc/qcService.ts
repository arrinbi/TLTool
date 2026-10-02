import type { ManhwaPage } from '../../types';
import { getRegionTypesettingLayout } from '../typesetting/typesettingService';

export type QcIssueSeverity = 'warning' | 'error';
export type QcIssueCategory = 'translation' | 'typesetting' | 'cleaning';

export interface QcIssue {
  id: string;
  regionId: string;
  severity: QcIssueSeverity;
  category: QcIssueCategory;
  message: string;
}

export interface QcSummary {
  totalRegions: number;
  translated: number;
  untranslated: number;
  typeset: number;
  notTypeset: number;
  warnings: number;
  errors: number;
}

export interface QcReport {
  pageId: string;
  summary: QcSummary;
  issues: QcIssue[];
  timestamp: number;
}

/**
 * Executes comprehensive Quality Control (QC) checks on a page and generates a QC report.
 * Strictly non-destructive and read-only.
 */
export function runQualityControl(
  page: ManhwaPage,
  defaultFontFamily: string = 'sans-serif'
): QcReport {
  const issues: QcIssue[] = [];

  let translatedCount = 0;
  let typesetCount = 0;

  for (const region of page.regions) {
    const rawText = (region.text || '').trim();
    const translatedText = (region.translatedText || region.translation || '').trim();
    const hasRawText = rawText.length > 0;
    const hasTranslation = translatedText.length > 0;
    const hasTypesetting = Boolean(
      region.typesetting &&
        (region.typesetting.fontFamily !== undefined ||
          region.typesetting.fontSize !== undefined ||
          region.typesetting.fontWeight !== undefined ||
          region.typesetting.color !== undefined ||
          region.typesetting.align !== undefined ||
          region.typesetting.lineHeight !== undefined)
    );

    if (hasTranslation) {
      translatedCount++;
    }

    if (hasTypesetting) {
      typesetCount++;
    }

    // --------------------------------------------------
    // 1. TRANSLATION CHECKS
    // --------------------------------------------------
    if (hasRawText && !hasTranslation) {
      issues.push({
        id: `qc-trans-missing-${region.id}`,
        regionId: region.id,
        severity: 'error',
        category: 'translation',
        message: 'Original OCR text exists, but translation is empty.',
      });
    }

    if (!hasRawText && hasTranslation) {
      issues.push({
        id: `qc-trans-no-ocr-${region.id}`,
        regionId: region.id,
        severity: 'warning',
        category: 'translation',
        message: 'Translation exists, but original OCR text is empty.',
      });
    }

    if (hasRawText && hasTranslation && rawText === translatedText) {
      issues.push({
        id: `qc-trans-identical-${region.id}`,
        regionId: region.id,
        severity: 'warning',
        category: 'translation',
        message: 'Translated text is identical to original OCR text (likely untranslated raw copy).',
      });
    }

    // --------------------------------------------------
    // 2. TYPESETTING CHECKS
    // --------------------------------------------------
    if (hasTranslation && !hasTypesetting) {
      issues.push({
        id: `qc-type-missing-${region.id}`,
        regionId: region.id,
        severity: 'error',
        category: 'typesetting',
        message: 'Region is translated, but typesetting configuration is missing.',
      });
    }

    if (region.typesetting?.fontSize !== undefined && region.typesetting.fontSize < 10) {
      issues.push({
        id: `qc-type-small-font-${region.id}`,
        regionId: region.id,
        severity: 'warning',
        category: 'typesetting',
        message: `Font size is too small (${region.typesetting.fontSize}px < 10px).`,
      });
    }

    if (region.bbox && region.bbox.width > 0 && region.bbox.height > 0) {
      const wRatio = region.bbox.width / region.bbox.height;
      const hRatio = region.bbox.height / region.bbox.width;
      if (wRatio > 6 || hRatio > 6) {
        issues.push({
          id: `qc-type-extreme-aspect-${region.id}`,
          regionId: region.id,
          severity: 'warning',
          category: 'typesetting',
          message: `Extreme text box aspect ratio (${wRatio > 6 ? wRatio.toFixed(1) : hRatio.toFixed(1)}:1 exceeds 6:1).`,
        });
      }

      // Text overflow heuristic
      if (hasTranslation) {
        const { fontSize, lines } = getRegionTypesettingLayout(region, undefined, defaultFontFamily);
        const lineHeight = region.typesetting?.lineHeight ?? 1.2;
        const lineSpacing = fontSize * lineHeight;
        const totalTextHeight = lines.length * lineSpacing;

        if (totalTextHeight > region.bbox.height) {
          issues.push({
            id: `qc-type-overflow-${region.id}`,
            regionId: region.id,
            severity: 'warning',
            category: 'typesetting',
            message: `Estimated text height (${Math.round(totalTextHeight)}px) exceeds bounding box height (${region.bbox.height}px).`,
          });
        }
      }
    }

    // --------------------------------------------------
    // 3. CLEANING CHECKS
    // --------------------------------------------------
    if ((hasRawText || hasTranslation) && !region.isCleaned) {
      issues.push({
        id: `qc-clean-dirty-${region.id}`,
        regionId: region.id,
        severity: 'warning',
        category: 'cleaning',
        message: 'Region contains text or translation, but background is not cleaned yet.',
      });
    }
  }

  const totalRegions = page.regions.length;
  const untranslatedCount = totalRegions - translatedCount;
  const notTypesetCount = totalRegions - typesetCount;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const summary: QcSummary = {
    totalRegions,
    translated: translatedCount,
    untranslated: untranslatedCount,
    typeset: typesetCount,
    notTypeset: notTypesetCount,
    warnings: warningCount,
    errors: errorCount,
  };

  return {
    pageId: page.id,
    summary,
    issues,
    timestamp: Date.now(),
  };
}

export interface QcModule {
  checkPageQuality(page: ManhwaPage): Promise<QcIssue[]>;
}

export class DefaultQcModule implements QcModule {
  async checkPageQuality(page: ManhwaPage): Promise<QcIssue[]> {
    const report = runQualityControl(page);
    return report.issues;
  }
}

export const qcModule = new DefaultQcModule();
