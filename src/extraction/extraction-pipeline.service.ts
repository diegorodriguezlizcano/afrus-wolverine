import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SyncDirection, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AfrusApiService } from '../afrus-api/afrus-api.service.js';
import { SyncTagsService } from '../sync-tags/sync-tags.service.js';
import {
  ExtractionPipeline,
  MappedLead,
} from './extraction-pipeline.js';

export interface ExtractionResult {
  syncTagId: string;
  syncTagValue: string;
  afrusTagName: string;
  totalPages: number;
  totalLeads: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
}

@Injectable()
export class ExtractionPipelineService {
  private readonly logger = new Logger(ExtractionPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly afrusApi: AfrusApiService,
    private readonly syncTagsService: SyncTagsService,
  ) {}

  /**
   * Runs the extraction pipeline for a specific sync tag.
   *
   * Steps:
   * 1. Validate sync tag exists and is active
   * 2. Paginate through afrus leads (100/page) matching the sync tag
   * 3. For each lead: map → upsert Lead → upsert Tags → log SyncLog
   */
  async runExtraction(
    organizationId: string,
    syncTagValue: string,
  ): Promise<ExtractionResult> {
    // ── 1. Resolve sync tag ────────────────────────────────────────────────
    const syncTag = await this.syncTagsService.getByTagValue(syncTagValue, organizationId);
    if (!syncTag.isActive) {
      throw new NotFoundException(
        `Sync tag "${syncTagValue}" is inactive. Activate it before syncing.`,
      );
    }

    const apiKey = await this.afrusApi.getOrgApiKey(organizationId);
    const result: ExtractionResult = {
      syncTagId: syncTag.id,
      syncTagValue: syncTag.tagValue,
      afrusTagName: syncTag.afrusTagName,
      totalPages: 0,
      totalLeads: 0,
      createdCount: 0,
      updatedCount: 0,
      errorCount: 0,
      errors: [],
    };

    // ── 2. Paginate through afrus ─────────────────────────────────────────
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await this.afrusApi.getLeads(apiKey, {
        page,
        perPage: 100,
      });

      totalPages = response.total_pages;
      result.totalPages = totalPages;
      result.totalLeads += response.data.length;

      // ── 3. Filter leads matching this sync tag's afrus tag ─────────────
      const matchingLeads = response.data.filter((lead) => {
        const tags: string[] = lead.tags ?? [];
        return tags.some(
          (t) => t.toLowerCase() === syncTag.afrusTagName.toLowerCase(),
        );
      });

      // ── 4. Process each matching lead ──────────────────────────────────
      for (const afrusLead of matchingLeads) {
        try {
          const mapped = ExtractionPipeline.mapAfrusLeadToWolverine(afrusLead);

          const wasCreated = await this.upsertLead(organizationId, mapped);

          if (wasCreated) {
            result.createdCount++;
          } else {
            result.updatedCount++;
          }

          // Assign origin tag if detected
          if (mapped.originTag) {
            await this.upsertOriginTag(mapped.email, organizationId, mapped.originTag);
          }

          // Assign sync tag to the lead
          await this.upsertSyncTag(mapped.email, organizationId, syncTagValue);

          // Log the sync
          await this.logSync(
            organizationId,
            mapped.email,
            SyncDirection.FROM_AFRUS,
            SyncStatus.SYNCED,
            { syncTag: syncTagValue, afrusLeadId: mapped.afrusLeadId },
          );
        } catch (err) {
          result.errorCount++;
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`lead=${afrusLead.email}: ${msg}`);
          this.logger.error(`Extraction error for lead=${afrusLead.email}: ${msg}`);

          // Log the failed sync
          await this.logSync(
            organizationId,
            afrusLead.email,
            SyncDirection.FROM_AFRUS,
            SyncStatus.FAILED,
            { syncTag: syncTagValue, error: msg },
            msg,
          );
        }
      }

      page++;
    }

    this.logger.log(
      `Extraction complete for sync_tag="${syncTagValue}": ` +
        `${result.createdCount} created, ${result.updatedCount} updated, ${result.errorCount} errors`,
    );

    return result;
  }

  /**
   * Upserts a lead in Wolverine's database.
   * Returns true if created, false if updated.
   */
  private async upsertLead(organizationId: string, lead: MappedLead): Promise<boolean> {
    const existing = await this.prisma.lead.findFirst({
      where: { email: lead.email, organizationId },
    });

    if (!existing) {
      await this.prisma.lead.create({
        data: {
          email: lead.email,
          organizationId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          stage: lead.stage,
          temperature: lead.temperature,
          dealValue: lead.dealValue ?? undefined,
          afrusLeadId: lead.afrusLeadId,
        },
      });
      return true;
    } else {
      await this.prisma.lead.update({
        where: { email: lead.email },
        data: {
          firstName: lead.firstName ?? existing.firstName,
          lastName: lead.lastName ?? existing.lastName,
          phone: lead.phone ?? existing.phone,
          stage: lead.stage,
          temperature: lead.temperature,
          dealValue: lead.dealValue ?? existing.dealValue,
          afrusLeadId: lead.afrusLeadId,
        },
      });
      return false;
    }
  }

  /**
   * Upserts the origin tag for a lead.
   * Creates if absent; updates value if present.
   */
  private async upsertOriginTag(
    email: string,
    organizationId: string,
    originValue: string,
  ): Promise<void> {
    const existing = await this.prisma.tag.findFirst({
      where: { leadEmail: email, organizationId, tagType: 'ORIGIN' },
    });
    if (existing) {
      await this.prisma.tag.update({
        where: { id: existing.id },
        data: { tagValue: originValue },
      });
    } else {
      await this.prisma.tag.create({
        data: { leadEmail: email, organizationId, tagType: 'ORIGIN', tagValue: originValue },
      });
    }
  }

  /**
   * Assigns the sync tag to a lead (idempotent — no-op if already present).
   */
  private async upsertSyncTag(
    email: string,
    organizationId: string,
    syncTagValue: string,
  ): Promise<void> {
    const existing = await this.prisma.tag.findFirst({
      where: { leadEmail: email, organizationId, tagType: 'SYNC', tagValue: syncTagValue },
    });
    if (!existing) {
      await this.prisma.tag.create({
        data: { leadEmail: email, organizationId, tagType: 'SYNC', tagValue: syncTagValue },
      });
    }
  }

  /**
   * Logs a sync operation to the sync_log table.
   */
  private async logSync(
    organizationId: string,
    leadEmail: string,
    direction: SyncDirection,
    status: SyncStatus,
    payload: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.syncLog.create({
      data: {
        organizationId,
        leadEmail,
        direction,
        status,
        payload: payload as Prisma.InputJsonValue,
        errorMessage: errorMessage ?? null,
        syncedAt: status === SyncStatus.SYNCED ? new Date() : null,
      },
    });
  }
}
