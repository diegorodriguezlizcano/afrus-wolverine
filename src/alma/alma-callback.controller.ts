import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionStatus, Prisma } from '@prisma/client';

export interface AlmaCallbackDto {
  callbackId: string;
  actionTagLogId?: string;
  leadEmail: string;
  organizationId: string;
  status: 'completed' | 'failed' | 'needs_human';
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * ALMA → Wolverine Callback Handler
 *
 * Receives callbacks from ALMA when an action sequence completes,
 * fails, or requires human intervention.
 *
 * Updates the corresponding ActionTagLog entry and creates SDR
 * alert tasks when needed.
 */
@Controller('alma/callback')
export class AlmaCallbackController {
  private readonly logger = new Logger(AlmaCallbackController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /alma/callback
   * Receives ALMA callback when an action sequence completes.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() dto: AlmaCallbackDto) {
    this.logger.log(
      `ALMA callback received: lead=${dto.leadEmail}, status=${dto.status}, callbackId=${dto.callbackId}`,
    );

    // Map ALMA status to ActionStatus enum
    const statusMap: Record<string, ActionStatus> = {
      completed: ActionStatus.COMPLETED,
      failed: ActionStatus.FAILED,
      needs_human: ActionStatus.NEEDS_HUMAN,
    };

    const newStatus = statusMap[dto.status] ?? ActionStatus.FAILED;

    // Find the most recent ActionTagLog for this lead
    const actionLog = await this.prisma.actionTagLog.findFirst({
      where: {
        leadEmail: dto.leadEmail,
        organizationId: dto.organizationId,
        status: ActionStatus.TRIGGERED,
      },
      orderBy: { triggeredAt: 'desc' },
    });

    if (!actionLog) {
      this.logger.warn(
        `No pending ActionTagLog found for lead=${dto.leadEmail}, org=${dto.organizationId}. Callback ignored.`,
      );
      return {
        received: true,
        warning: 'No pending action tag log found',
      };
    }

    // Update the ActionTagLog
    await this.prisma.actionTagLog.update({
      where: { id: actionLog.id },
      data: {
        status: newStatus,
        almaResponse: (dto.data ?? { message: dto.message }) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `ActionTagLog ${actionLog.id} updated: ${actionLog.status} → ${newStatus}`,
    );

    // If ALMA returned needs_human, create an SDR alert
    if (dto.status === 'needs_human') {
      this.logger.warn(
        `ALMA needs human intervention for lead=${dto.leadEmail}: ${dto.message ?? 'No details provided'}`,
      );
      // TODO: In future, create a proper SDR task/alert entity
      // For now, we log it and the SLA monitor will pick it up
    }

    return {
      received: true,
      actionTagLogId: actionLog.id,
      newStatus,
    };
  }
}
