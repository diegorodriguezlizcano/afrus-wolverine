import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { AssignTagsDto } from './dto/assign-tags.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class TagsController {
  constructor(
    private readonly tagsService: TagsService,
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
   * POST /leads/:email/tags
   * Assigns tags to a lead.
   */
  @Post('leads/:email/tags')
  async assignTags(
    @Param('email') email: string,
    @Body() dto: AssignTagsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    const org = await this.getOrgByApiKey(apiKey);
    return this.tagsService.assignTags(
      email,
      dto.tags,
      null,
      org.id,
      org.afrusApiKey,
    );
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
    const org = await this.getOrgByApiKey(apiKey);
    const tags = await this.tagsService.getLeadTags(email, org.id);
    return {
      email,
      tags: tags.map((t) => ({
        type: t.tagType,
        value: t.tagValue,
        assignedAt: t.createdAt,
      })),
    };
  }
}
