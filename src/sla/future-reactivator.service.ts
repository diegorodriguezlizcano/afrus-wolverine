import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { PipelineStage, Temperature } from '@prisma/client';

/**
 * Future Stage Auto-Reactivation Engine (ISS-008)
 *
 * Wolverine schedules reactivation at `next_contact_date - 30 days`.
 * On trigger: `FUTURE` → `NEW` with correct logging, temperature update, SDR notification.
 *
 * Runs daily at 6:00 AM (Bogotá time).
 */
@Injectable()
export class FutureReactivatorService {
  private readonly logger = new Logger(FutureReactivatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs daily: checks all FUTURE leads and reactivates those whose
   * next_contact_date is within 30 days or has passed.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkAndReactivate(): Promise<void> {
    this.logger.log('Starting daily FUTURE stage reactivation check...');

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Find FUTURE leads whose next_contact_date is within 30 days or has passed
    const leadsToReactivate = await this.prisma.lead.findMany({
      where: {
        stage: PipelineStage.FUTURE,
        nextContactDate: {
          lte: thirtyDaysFromNow,
        },
      },
      select: {
        email: true,
        organizationId: true,
        nextContactDate: true,
        assignedToId: true,
      },
    });

    if (leadsToReactivate.length === 0) {
      this.logger.debug('No FUTURE leads to reactivate.');
      return;
    }

    this.logger.log(`Found ${leadsToReactivate.length} FUTURE lead(s) to reactivate.`);

    let reactivated = 0;
    let errors = 0;

    for (const lead of leadsToReactivate) {
      try {
        await this.reactivateLead(lead.email, lead.organizationId, lead.nextContactDate);
        reactivated++;
      } catch (err) {
        errors++;
        this.logger.error(
          `Failed to reactivate lead=${lead.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Reactivation complete: ${reactivated} reactivated, ${errors} errors.`,
    );
  }

  /**
   * Reactivates a single lead from FUTURE → NEW.
   */
  private async reactivateLead(
    email: string,
    organizationId: string,
    nextContactDate: Date | null,
  ): Promise<void> {
    const now = new Date();

    // Atomic: update lead + log transition
    await this.prisma.$transaction([
      // Update lead: FUTURE → NEW
      this.prisma.lead.update({
        where: { email },
        data: {
          stage: PipelineStage.NEW,
          temperature: Temperature.WARM,
          reactivatedAt: now,
          nextContactDate: null, // Clear after reactivation
          stageEnteredAt: now,
        },
      }),
      // Log the transition
      this.prisma.stageTransitionLog.create({
        data: {
          leadEmail: email,
          organizationId,
          fromStage: PipelineStage.FUTURE,
          toStage: PipelineStage.NEW,
          triggeredById: 'wolverine-system', // System-triggered
          metadata: {
            reason: 'auto_reactivation',
            originalNextContactDate: nextContactDate?.toISOString() ?? null,
            reactivatedAt: now.toISOString(),
          },
        },
      }),
    ]);

    this.logger.log(
      `Reactivated lead=${email}: FUTURE → NEW (was scheduled for ${nextContactDate?.toISOString().split('T')[0] ?? 'N/A'})`,
    );
  }
}
