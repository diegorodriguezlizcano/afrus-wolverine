import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AfrusApiService } from '../afrus-api/afrus-api.service.js';
import { SyncDirection, SyncStatus } from '@prisma/client';

/**
 * Write-back result summary.
 */
export interface WritebackResult {
  email: string;
  success: boolean;
  error?: string;
}

/**
 * Wolverine → afrus Write-Back Service
 *
 * Writes Wolverine lead changes (stage transitions, temperature changes,
 * tag assignments) back to the afrus platform.
 *
 * This is the write-back half of the bidirectional sync.
 * The Bidirectional Sync Orchestrator (ISS-012) orchestrates both directions.
 */
@Injectable()
export class WritebackService {
  private readonly logger = new Logger(WritebackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly afrusApi: AfrusApiService,
  ) {}

  /**
   * Writes back a lead's current state to afrus.
   * Used by the sync orchestrator after Wolverine stage/temperature changes.
   */
  async writebackLead(
    organizationId: string,
    email: string,
  ): Promise<WritebackResult> {
    try {
      const apiKey = await this.afrusApi.getOrgApiKey(organizationId);

      // ── 1. Load Wolverine lead state ─────────────────────────────────────
      const lead = await this.prisma.lead.findFirst({
        where: { email, organizationId },
        select: {
          email: true,
          stage: true,
          temperature: true,
        },
      });

      if (!lead) {
        return { email, success: false, error: 'Lead not found in Wolverine' };
      }

      // ── 2. Determine what afrus tags to sync ────────────────────────────
      const tags = [
        `stage:${lead.stage.toLowerCase()}`,
        `temp:${lead.temperature.toLowerCase()}`,
      ];

      // ── 3. Push to afrus ────────────────────────────────────────────────
      await this.afrusApi.assignTagsRemovePrevious(apiKey, { email, tags });

      // ── 4. Log the write-back ──────────────────────────────────────────
      await this.logSync(organizationId, email, SyncDirection.TO_AFRUS, SyncStatus.SYNCED);

      this.logger.debug(`Writeback success: ${email} → afrus`);
      return { email, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Writeback failed for ${email}: ${msg}`);

      await this.logSync(organizationId, email, SyncDirection.TO_AFRUS, SyncStatus.FAILED, msg);
      return { email, success: false, error: msg };
    }
  }

  /**
   * Writes back all leads for an organization to afrus.
   */
  async writebackAllLeads(organizationId: string): Promise<WritebackResult[]> {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId },
      select: { email: true },
    });

    const results: WritebackResult[] = [];
    for (const lead of leads) {
      const result = await this.writebackLead(organizationId, lead.email);
      results.push(result);
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    this.logger.log(
      `Bulk writeback for org=${organizationId}: ${ok} ok, ${fail} failed`,
    );

    return results;
  }

  /**
   * Writes back a specific stage transition result to afrus.
   * Called by PipelineService after a successful stage transition.
   */
  async writebackStageTransition(
    organizationId: string,
    email: string,
    newStage: string,
  ): Promise<WritebackResult> {
    try {
      const apiKey = await this.afrusApi.getOrgApiKey(organizationId);
      await this.afrusApi.assignTagsRemovePrevious(apiKey, {
        email,
        tags: [`stage:${newStage.toLowerCase()}`],
      });

      await this.logSync(organizationId, email, SyncDirection.TO_AFRUS, SyncStatus.SYNCED);
      return { email, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logSync(organizationId, email, SyncDirection.TO_AFRUS, SyncStatus.FAILED, msg);
      return { email, success: false, error: msg };
    }
  }

  private async logSync(
    organizationId: string,
    email: string,
    direction: SyncDirection,
    status: SyncStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.syncLog.create({
      data: {
        organizationId,
        leadEmail: email,
        direction,
        status,
        payload: { source: 'writeback' },
        syncedAt: status === SyncStatus.SYNCED ? new Date() : null,
        errorMessage: errorMessage ?? null,
      },
    });
  }
}
