import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getOrgByApiKey(apiKey: string) {
    if (!apiKey) {
      throw new BadRequestException('Missing X-API-Key header');
    }
    const org = await this.prisma.organization.findFirst({
      where: { afrusApiKey: apiKey },
    });
    if (!org) {
      throw new BadRequestException('Invalid API key');
    }
    return org;
  }

  /**
   * POST /leads — Create or upsert a lead
   */
  @Post()
  async createLead(
    @Body() dto: CreateLeadDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    const org = await this.getOrgByApiKey(apiKey);
    const lead = await this.leadsService.upsertLead(org.id, dto);
    return { success: true, lead };
  }

  /**
   * GET /leads — List leads with pagination
   */
  @Get()
  async listLeads(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('x-api-key') apiKey?: string,
  ) {
    const org = await this.getOrgByApiKey(apiKey!);
    return this.leadsService.listLeads(
      org.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * GET /leads/:email — Get lead details
   */
  @Get(':email')
  async getLead(
    @Param('email') email: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    const org = await this.getOrgByApiKey(apiKey);
    const lead = await this.leadsService.getLead(email, org.id);
    return { success: true, lead };
  }
}
