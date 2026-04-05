import { Logger } from '@nestjs/common';
import { PipelineStage, Temperature } from '@prisma/client';

/**
 * SLA Configuration — per-stage SLA windows in hours.
 *
 * A lead is "at risk" if it has been in a stage longer than its SLA window.
 * A lead is "stale" if it has been in a stage for more than 2× the SLA window.
 *
 * Default SLAs (industry standard for fundraising CRM):
 * - NEW: 24h — first contact within 1 day
 * - SCHEDULED: 72h — meeting must happen within 3 days
 * - MET: 48h — follow-up within 2 days after meeting
 * - QUALIFIED: 120h — qualify within 5 days
 * - PROPOSED: 72h — respond to proposal within 3 days
 * - NEGOTIATING: 120h — close negotiation within 5 days
 * - FUTURE: no SLA (on hold)
 */
export const SLA_CONFIG: Record<string, { slaHours: number; label: string }> = {
  [PipelineStage.NEW]:         { slaHours: 24,  label: 'NEW → first contact' },
  [PipelineStage.SCHEDULED]:    { slaHours: 72,  label: 'SCHEDULED → meeting within 3d' },
  [PipelineStage.MET]:          { slaHours: 48,  label: 'MET → follow-up within 2d' },
  [PipelineStage.QUALIFIED]:   { slaHours: 120, label: 'QUALIFIED → qualify within 5d' },
  [PipelineStage.PROPOSED]:    { slaHours: 72,  label: 'PROPOSED → respond within 3d' },
  [PipelineStage.NEGOTIATING]: { slaHours: 120, label: 'NEGOTIATING → close within 5d' },
  [PipelineStage.FUTURE]:      { slaHours: 0,   label: 'FUTURE → no SLA (on hold)' },
};

/** Temperature downgrade map for stale leads. */
export const TEMP_DOWNGRADE_MAP: Record<string, Temperature> = {
  [Temperature.HOT]: Temperature.WARM,
  [Temperature.WARM]: Temperature.COLD,
  [Temperature.COLD]: Temperature.COLD,
};

/**
 * SLA Status for a single lead.
 */
export interface SlaStatus {
  leadEmail: string;
  currentStage: PipelineStage;
  hoursInStage: number;
  slaHours: number;
  isBreached: boolean;      // hoursInStage > slaHours
  isStale: boolean;         // hoursInStage > 2 × slaHours
  percentUsed: number;      // hoursInStage / slaHours * 100
}

/**
 * SLA Monitor — evaluates SLA status for active leads.
 *
 * This class is pure logic (no Nest.js deps, no DB access).
 * The CronJob in sla-monitor.service.ts orchestrates the batch logic.
 */
export class SlaMonitor {
  private readonly logger = new Logger(SlaMonitor.name);

  /**
   * Calculates SLA status for a lead given the stage it entered.
   */
  static calculateStatus(
    leadEmail: string,
    stage: PipelineStage,
    enteredAt: Date,
    now: Date = new Date(),
  ): SlaStatus {
    const config = SLA_CONFIG[stage];
    const slaHours = config?.slaHours ?? 0;

    const hoursInStage = (now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);

    return {
      leadEmail,
      currentStage: stage,
      hoursInStage: Math.round(hoursInStage * 10) / 10,
      slaHours,
      isBreached: slaHours > 0 && hoursInStage > slaHours,
      isStale: slaHours > 0 && hoursInStage > slaHours * 2,
      percentUsed: slaHours > 0 ? Math.round((hoursInStage / slaHours) * 100) : 0,
    };
  }

  /**
   * Returns the temperature downgrade target if the lead should be downgraded.
   * Returns null if no downgrade is needed.
   */
  static shouldDowngrade(status: SlaStatus, currentTemp: Temperature): Temperature | null {
    if (!status.isStale) return null;
    const downgrade = TEMP_DOWNGRADE_MAP[currentTemp];
    return downgrade !== currentTemp ? downgrade : null;
  }

  /**
   * Returns a human-readable urgency label.
   */
  static getUrgencyLabel(status: SlaStatus): 'ok' | 'at_risk' | 'breached' | 'stale' {
    if (status.isStale) return 'stale';
    if (status.isBreached) return 'breached';
    if (status.percentUsed >= 80) return 'at_risk';
    return 'ok';
  }

  /**
   * Returns the alert message for a given status.
   */
  static getAlertMessage(status: SlaStatus, assignedTo?: string): string {
    const urgency = this.getUrgencyLabel(status);
    const assignee = assignedTo ? ` (SDR: ${assignedTo})` : '';
    return `[${urgency.toUpperCase()}] Lead ${status.leadEmail} has been in ${status.currentStage} for ${status.hoursInStage}h (SLA: ${status.slaHours}h)${assignee}`;
  }
}
