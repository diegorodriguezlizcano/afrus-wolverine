import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StageMachine } from '../stage-machine/stage-machine.js';
import { RuleEngine } from '../rule-engine/rule-engine.js';
import type { TransitionContext } from '../rule-engine/rule-engine.js';
import { PipelineStage } from '@prisma/client';

export interface TransitionResult {
  success: boolean;
  leadEmail: string;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  transitionLogId: string;
}

export interface TransitionOptions {
  lostReasonId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transitions a lead from its current stage to a new stage.
   * Validates against the state machine, updates the lead, and logs the transition.
   *
   * @throws NotFoundException if lead doesn't exist
   * @throws BadRequestException if transition is invalid
   */
  async transition(
    leadEmail: string,
    toStage: PipelineStage,
    triggeredById: string,
    options: TransitionOptions = {},
  ): Promise<TransitionResult> {
    const lead = await this.prisma.lead.findFirst({
      where: { email: leadEmail },
      select: {
        email: true,
        stage: true,
        organizationId: true,
        temperature: true,
        scheduledAt: true,
        metAt: true,
        assignedToId: true,
        dealValue: true,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with email ${leadEmail} not found`);
    }

    const fromStage = lead.stage as PipelineStage;

    // ─── Rule Engine evaluation ───────────────────────────────────────────
    const ctx: TransitionContext = {
      leadEmail,
      organizationId: lead.organizationId,
      currentStage: fromStage,
      currentTemperature: lead.temperature as any,
      scheduledAt: lead.scheduledAt,
      metAt: lead.metAt,
      assignedToId: lead.assignedToId,
      dealValue: lead.dealValue ? Number(lead.dealValue) : null,
    };

    // This throws BadRequestException if validation fails
    const ruleResult = RuleEngine.evaluateOrThrow(ctx, toStage, options.lostReasonId);

    // ─── Determine which timestamp to set ───────────────────────────────
    const updateData: {
      stage: PipelineStage;
      scheduledAt?: Date;
      metAt?: Date;
    } = { stage: toStage };
    if (toStage === PipelineStage.SCHEDULED) {
      updateData.scheduledAt = new Date();
    }
    if (toStage === PipelineStage.MET) {
      updateData.metAt = new Date();
    }

    // ─── Atomic update: lead + transition log ────────────────────────────
    const [updatedLead, transitionLog] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { email: leadEmail },
        data: updateData,
      }),
      this.prisma.stageTransitionLog.create({
        data: {
          leadEmail,
          organizationId: lead.organizationId,
          fromStage,
          toStage,
          triggeredById,
          metadata: {
            ...(options.metadata ?? {}),
            ...(options.lostReasonId && { lostReasonId: options.lostReasonId }),
          },
        },
      }),
    ]);

    this.logger.log(
      `Stage transition: lead=${leadEmail} ${fromStage} → ${toStage} (logged=${transitionLog.id})`,
    );

    return {
      success: true,
      leadEmail,
      fromStage,
      toStage,
      transitionLogId: transitionLog.id,
    };
  }

  /**
   * Returns the stage transition history for a lead.
   */
  async getTransitionHistory(leadEmail: string, organizationId: string) {
    return this.prisma.stageTransitionLog.findMany({
      where: { leadEmail, organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        triggeredBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Returns valid next stages for a lead's current stage.
   */
  getValidNextStages(currentStage: PipelineStage): PipelineStage[] {
    return StageMachine.getValidNextStages(currentStage);
  }
}
