import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SyncTagsService } from './sync-tags.service.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';
import { CreateSyncTagDto, UpdateSyncTagDto } from './dto/create-sync-tag.dto.js';

@Controller('sync-tags')
@UseGuards(OrganizationGuard)
export class SyncTagsController {
  constructor(private readonly syncTagsService: SyncTagsService) {}

  /**
   * GET /sync-tags
   * Lists all sync tags for the authenticated organization.
   */
  @Get()
  async list(@Req() req: any) {
    const orgId = req['organization'].id;
    return this.syncTagsService.list(orgId);
  }

  /**
   * GET /sync-tags/:id
   */
  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    return this.syncTagsService.getById(id, req['organization'].id);
  }

  /**
   * POST /sync-tags
   * Creates a new sync tag.
   */
  @Post()
  async create(@Body() dto: CreateSyncTagDto, @Req() req: any) {
    return this.syncTagsService.create(req['organization'].id, dto);
  }

  /**
   * PATCH /sync-tags/:id
   * Updates a sync tag (partial update).
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSyncTagDto,
    @Req() req: any,
  ) {
    return this.syncTagsService.update(id, req['organization'].id, dto);
  }

  /**
   * DELETE /sync-tags/:id
   * Hard-deletes a sync tag.
   */
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.syncTagsService.delete(id, req['organization'].id);
    return { deleted: true, id };
  }
}
