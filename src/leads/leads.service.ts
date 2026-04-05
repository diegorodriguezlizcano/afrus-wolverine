import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { PipelineStage, Temperature } from '@prisma/client';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates or upserts a lead by email.
   */
  async upsertLead(organizationId: string, dto: CreateLeadDto) {
    const lead = await this.prisma.lead.upsert({
      where: { email: dto.email },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        stage: (dto.stage?.toUpperCase() as PipelineStage) ?? PipelineStage.NEW,
        temperature: (dto.temperature?.toUpperCase() as Temperature) ?? Temperature.COLD,
      },
      create: {
        email: dto.email,
        organizationId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        afrusLeadId: dto.afrusLeadId ?? null,
        stage: (dto.stage?.toUpperCase() as PipelineStage) ?? PipelineStage.NEW,
        temperature: (dto.temperature?.toUpperCase() as Temperature) ?? Temperature.COLD,
      },
    });

    this.logger.debug(`Lead upserted: ${lead.email}`);
    return lead;
  }

  /**
   * Gets a lead by email.
   */
  async getLead(email: string, organizationId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { email, organizationId },
      include: { tags: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with email ${email} not found`);
    }

    return lead;
  }

  /**
   * Lists leads with pagination.
   */
  async listLeads(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { tags: true },
      }),
      this.prisma.lead.count({ where: { organizationId } }),
    ]);

    return {
      data: leads,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
