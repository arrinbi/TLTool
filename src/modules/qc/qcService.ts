import type { ManhwaPage } from '../../types';

export interface QcIssue {
  id: string;
  regionId?: string;
  severity: 'warning' | 'error';
  message: string;
}

/**
 * Modular interface for Quality Control (QC) module.
 * Future extension: Uncleaned text region detector, overflow text check, low confidence OCR alert.
 */
export interface QcModule {
  checkPageQuality(page: ManhwaPage): Promise<QcIssue[]>;
}

export class StubQcModule implements QcModule {
  async checkPageQuality(page: ManhwaPage): Promise<QcIssue[]> {
    const issues: QcIssue[] = [];

    page.regions.forEach((region) => {
      if (!region.isCleaned) {
        issues.push({
          id: `qc-uncleaned-${region.id}`,
          regionId: region.id,
          severity: 'warning',
          message: 'Text region has not been cleaned yet.',
        });
      }
      if (region.confidence < 50) {
        issues.push({
          id: `qc-low-conf-${region.id}`,
          regionId: region.id,
          severity: 'warning',
          message: `Low OCR confidence (${region.confidence}%). Check bounding box alignment.`,
        });
      }
    });

    return issues;
  }
}

export const qcModule = new StubQcModule();
