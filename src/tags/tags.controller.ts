import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { AssignTagsDto } from './dto/assign-tags.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class TagsController {
  private readonly logger = new Logger(TagsController.name);

  constructor(
    private readonly tagsService: TagsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /leads/:email/tags
   * Assigns tags to a lead.
   */
  @Post('leads/:email/tags')
  async assignTags(
    @Param('email') email: string,
    @Body() dto: AssignTagsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    if (!apiKey) {
      throw new BadRequestException('Missing X-API-Key header');
    }

    const org = await this.prisma.organization.findUnique({
      where: { afrusApiKey: apiKey },
    });

    if (!org) {
      throw new BadRequestException('Invalid API key');
    }

    const result = await this.tagsService.assignTags(
      email,
      dto.tags,
      null, // assignedBy — could come from JWT in a real auth system
      org.organizationId,
      org.afrusApiKey,
    );

    return result;
  }

  /**
   * GET /leads/:email/tags
   * Returns all tags for a lead.
   */
  @Get('leads/:email/tags')
  async getTags(
    @Param('email') email: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    if (!apiKey) {
      throw new BadRequestException('Missing X-API-Key header');
    }

    const org = await this.prisma.organization.findUnique({
      where: { afrusApiKey: apiKey },
    });

    if (!org) {
      throw new BadRequestException('Invalid API key');
    }

    const tags = await this.tagsService.getLeadTags(email, org.organizationId);
    return {
      email,
      tags: tags.map((t) => ({
        type: t.type,
        value: t.value,
        assignedBy: t.assignedBy,
        assignedAt: t.assignedAt,
      })),
    };
  }
}
