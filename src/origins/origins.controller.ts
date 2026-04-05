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
import { OriginsService } from './origins.service.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';
import { CreateOriginDto, UpdateOriginDto } from './dto/create-origin.dto.js';

@Controller('origins')
@UseGuards(OrganizationGuard)
export class OriginsController {
  constructor(private readonly originsService: OriginsService) {}

  @Get()
  async list(@Req() req: any) {
    return this.originsService.list(req['organization'].id);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    return this.originsService.getById(id, req['organization'].id);
  }

  @Post()
  async create(@Body() dto: CreateOriginDto, @Req() req: any) {
    return this.originsService.create(req['organization'].id, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOriginDto,
    @Req() req: any,
  ) {
    return this.originsService.update(id, req['organization'].id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.originsService.delete(id, req['organization'].id);
    return { deleted: true, id };
  }
}
