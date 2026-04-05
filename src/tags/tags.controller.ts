import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { AssignTagsDto } from './dto/assign-tags.dto.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';
import { TagType } from './tag-type.enum.js';

@Controller('leads')
@UseGuards(OrganizationGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * POST /leads/:email/tags
   * Assigns one or more tags to a lead.
   * For action: tags, ALMA webhooks are triggered.
   */
  @Post(':email/tags')
  async assignTags(
    @Param('email') email: string,
    @Body() dto: AssignTagsDto,
    @Req() req: any,
  ) {
    const org = req['organization'];
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
  @Get(':email/tags')
  async getTags(@Param('email') email: string, @Req() req: any) {
    const org = req['organization'];
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

  /**
   * DELETE /leads/:email/tags/:type
   * Removes a tag of the given type from a lead.
   * e.g. DELETE /leads/john@example.com/tags/STAGE
   */
  @Delete(':email/tags/:type')
  async removeTag(
    @Param('email') email: string,
    @Param('type') type: string,
    @Req() req: any,
  ) {
    const org = req['organization'];
    await this.tagsService.removeTag(email, type.toUpperCase(), org.id);
    return { removed: true, email, type };
  }

  /**
   * DELETE /leads/:email/tags
   * Removes all tags from a lead.
   */
  @Delete(':email/tags')
  async removeAllTags(@Param('email') email: string, @Req() req: any) {
    const org = req['organization'];
    await this.tagsService.removeAllTags(email, org.id);
    return { removed: true, email, allTags: true };
  }
}
