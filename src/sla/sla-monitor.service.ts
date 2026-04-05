import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlaMonitor, SlaStatus } from './sla-monitor.js';
import { PipelineStage, Temperature } from '@prisma/client';

export interface SlaAlert {
  leadEmail: string;
  organizationId: string;
  assignedToId: string | null;
  status: SlaStatus;
  message: string;
  downgradeTo?: Temperature;
}

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs the SLA monitor check every hour.
   * Evaluates all active leads, flags breaches, and applies temperature downgrades.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkAllOrgs(): Promise<void> {
    this.logger.log('Starting hourly SLA check...');
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let totalAlerts = 0;

    for (const org of orgs) {
      const alerts = await this.checkOrg(org.id);
      totalAlerts += alerts.length;
    }

    this.logger.log(`SLA check complete. ${totalAlerts} alert(s) generated.`);
  }

  /**
   * Checks all active leads for a specific organization.
   * Returns alerts and applies temperature downgrades.
   */
  async checkOrg(organizationId: string): Promise<SlaAlert[]> {
    const alerts: SlaAlert[] = [];

    // ── 1. Find active leads ─────────────────────────────────────────────
    const activeLeads = await this.prisma.lead.findMany({
      where: {
        organizationId,
        stage: {
          in: [
            PipelineStage.NEW,
            PipelineStage.SCHEDULED,
            PipelineStage.MET,
            PipelineStage.QUALIFIED,
            PipelineStage.PROPOSED,
            PipelineStage.NEGOTIATING,
          ],
        },
      },
      select: {
        email: true,
        stage: true,
        temperature: true,
        assignedToId: true,
        scheduledAt: true,
        metAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const lead of activeLeads) {
      const enteredAt = this.getStageEnteredAt(lead);
      const status = SlaMonitor.calculateStatus(
        lead.email,
        lead.stage as PipelineStage,
        enteredAt,
      );

      // ── 2. Generate alerts for at-risk / breached leads ─────────────────
      const urgency = SlaMonitor.getUrgencyLabel(status);
      if (urgency !== 'ok') {
        const assignedUser = lead.assignedToId
          ? await this.getUserName(lead.assignedToId)
          : undefined;

        alerts.push({
          leadEmail: lead.email,
          organizationId,
          assignedToId: lead.assignedToId,
          status,
          message: SlaMonitor.getAlertMessage(status, assignedUser),
          downgradeTo: SlaMonitor.shouldDowngrade(status, lead.temperature as Temperature) ?? undefined,
        });

        // ── 3. Auto temperature downgrade on stale leads ─────────────────
        const downgradeTo = SlaMonitor.shouldDowngrade(
          status,
          lead.temperature as Temperature,
        );
        if (downgradeTo) {
          await this.downgradeTemperature(lead.email, organizationId, downgradeTo);
        }
      }
    }

    // Log summary for this org
    const breached = alerts.filter((a) => a.status.isBreached).length;
    const stale = alerts.filter((a) => a.status.isStale).length;
    if (alerts.length > 0) {
      this.logger.warn(
        `Org ${organizationId}: ${alerts.length} alert(s) — ${breached} breached, ${stale} stale`,
      );
    }

    return alerts;
  }

  /**
   * Returns the timestamp when the lead entered its current stage.
   * This is an approximation — for full accuracy, look at stageTransitionLog.
   */
  private getStageEnteredAt(lead: {
    stage: string;
    scheduledAt: Date | null;
    metAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
  }): Date {
    switch (lead.stage) {
      case PipelineStage.SCHEDULED:
        return lead.scheduledAt ?? lead.updatedAt;
      case PipelineStage.MET:
        return lead.metAt ?? lead.updatedAt;
      default:
        // For NEW, QUALIFIED, PROPOSED, NEGOTIATING: use updatedAt as proxy
        return lead.updatedAt;
    }
  }

  /**
   * Applies temperature downgrade via temp: tag.
   */
  private async downgradeTemperature(
    leadEmail: string,
    organizationId: string,
    downgradeTo: Temperature,
  ): Promise<void> {
    const tempLabel = downgradeTo.toLowerCase();

    await this.prisma.$transaction([
      // Remove existing temp tags
      this.prisma.tag.deleteMany({
        where: { leadEmail, organizationId, tagType: 'TEMP' },
      }),
      // Insert new temp tag
      this.prisma.tag.create({
        data: {
          leadEmail,
          organizationId,
          tagType: 'TEMP',
          tagValue: tempLabel,
        },
      }),
    ]);

    this.logger.log(
      `Auto-downgraded ${leadEmail}: → temp:${tempLabel}`,
    );
  }

  private async getUserName(userId: string): Promise<string | undefined> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { name: true },
      });
      return user?.name;
    } catch {
      return undefined;
    }
  }
}
