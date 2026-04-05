import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExtractionPipelineService } from '../extraction/extraction-pipeline.service.js';
import { WritebackService } from '../writeback/writeback.service.js';
import { SyncStatus } from '@prisma/client';

export interface BidirectionalSyncResult {
  direction: 'BIDIRECTIONAL';
  extraction: {
    totalLeads: number;
    created: number;
    updated: number;
    errors: number;
  };
  writeback: {
    total: number;
    succeeded: number;
    failed: number;
  };
  errors: string[];
}

@Injectable()
export class SyncOrchestratorService {
  private readonly logger = new Logger(SyncOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: ExtractionPipelineService,
    private readonly writeback: WritebackService,
  ) {}

  /**
   * Full bidirectional sync:
   * 1. Run extraction for all active sync tags (af Rus → Wolverine)
   * 2. Run write-back for all leads (Wolverine → af Rus)
   *
   * This is a heavy operation — call sparingly (e.g., from CLI or cron, not per-request).
   */
  async runBidirectionalSync(organizationId: string): Promise<BidirectionalSyncResult> {
    const result: BidirectionalSyncResult = {
      direction: 'BIDIRECTIONAL',
      extraction: { totalLeads: 0, created: 0, updated: 0, errors: 0 },
      writeback: { total: 0, succeeded: 0, failed: 0 },
      errors: [],
    };

    // ── Step 1: Extract from afrus ─────────────────────────────────────────
    this.logger.log(`Starting bidirectional sync for org=${organizationId}`);

    const syncTags = await this.prisma.syncTag.findMany({
      where: { organizationId, isActive: true },
      select: { tagValue: true },
    });

    for (const { tagValue } of syncTags) {
      try {
        const extraction = await this.extraction.runExtraction(organizationId, tagValue);
        result.extraction.totalLeads += extraction.totalLeads;
        result.extraction.created += extraction.createdCount;
        result.extraction.updated += extraction.updatedCount;
        result.extraction.errors += extraction.errorCount;
        result.errors.push(...extraction.errors);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`extraction(${tagValue}): ${msg}`);
      }
    }

    // ── Step 2: Write back to afrus ─────────────────────────────────────────
    const writebackResults = await this.writeback.writebackAllLeads(organizationId);
    result.writeback.total = writebackResults.length;
    result.writeback.succeeded = writebackResults.filter((r) => r.success).length;
    result.writeback.failed = writebackResults.filter((r) => !r.success).length;

    for (const r of writebackResults) {
      if (!r.success && r.error) {
        result.errors.push(`writeback(${r.email}): ${r.error}`);
      }
    }

    this.logger.log(
      `Bidirectional sync complete: ` +
        `extraction(${result.extraction.created}c/${result.extraction.updated}u/${result.extraction.errors}e), ` +
        `writeback(${result.writeback.succeeded}ok/${result.writeback.failed}fail)`,
    );

    return result;
  }

  /**
   * Returns sync history for an organization (last 100 sync_log entries).
   */
  async getSyncHistory(organizationId: string, limit = 100) {
    return this.prisma.syncLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Returns sync statistics for an organization.
   */
  async getSyncStats(organizationId: string) {
    const [total, synced, failed] = await Promise.all([
      this.prisma.syncLog.count({ where: { organizationId } }),
      this.prisma.syncLog.count({ where: { organizationId, status: SyncStatus.SYNCED } }),
      this.prisma.syncLog.count({ where: { organizationId, status: SyncStatus.FAILED } }),
    ]);

    return { total, synced, failed };
  }
}
