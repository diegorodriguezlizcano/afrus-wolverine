import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';
import { TransitionLeadDto } from './dto/transition-lead.dto.js';
import { PipelineStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('leads')
@UseGuards(OrganizationGuard)
export class PipelineController {
  constructor(
    private readonly pipelineService: PipelineService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /leads/:email/stage
   * Transitions a lead to a new pipeline stage.
   * Body: { toStage: "SCHEDULED", lostReasonId?: "uuid", metadata?: {} }
   */
  @Post(':email/stage')
  async transition(
    @Param('email') email: string,
    @Body() dto: TransitionLeadDto,
    @Req() req: any,
  ) {
    const org = req['organization'];
    const triggeredById = await this.getSystemUserId(org.id);

    return this.pipelineService.transition(
      email,
      dto.toStage as PipelineStage,
      triggeredById,
      {
        lostReasonId: dto.lostReasonId,
        metadata: dto.metadata,
      },
    );
  }

  /**
   * GET /leads/:email/stage/valid-transitions
   * Returns the list of valid next stages for a lead's current stage.
   */
  @Get(':email/stage/valid-transitions')
  async validTransitions(@Param('email') email: string, @Req() req: any) {
    const lead = await this.prisma.lead.findFirst({
      where: { email, organizationId: req['organization'].id },
      select: { stage: true },
    });

    if (!lead) {
      return { validTransitions: [], currentStage: null };
    }

    const currentStage = lead.stage as PipelineStage;
    return {
      currentStage,
      validTransitions: this.pipelineService.getValidNextStages(currentStage),
    };
  }

  /**
   * GET /leads/:email/stage/history
   * Returns the stage transition history for a lead.
   */
  @Get(':email/stage/history')
  async history(@Param('email') email: string, @Req() req: any) {
    return this.pipelineService.getTransitionHistory(email, req['organization'].id);
  }

  private async getSystemUserId(organizationId: string): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { organizationId, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) return admin.id;

    const anyUser = await this.prisma.user.findFirst({
      where: { organizationId },
    });
    if (anyUser) return anyUser.id;

    return organizationId; // fallback placeholder
  }
}
