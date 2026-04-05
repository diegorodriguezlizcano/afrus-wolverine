import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LostReasonsService } from './lost-reasons.service.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';
import { CreateLostReasonDto, UpdateLostReasonDto } from './dto/create-lost-reason.dto.js';

@Controller('lost-reasons')
@UseGuards(OrganizationGuard)
export class LostReasonsController {
  constructor(private readonly lostReasonsService: LostReasonsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.lostReasonsService.list(
      req['organization'].id,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    return this.lostReasonsService.getById(id, req['organization'].id);
  }

  @Post()
  async create(@Body() dto: CreateLostReasonDto, @Req() req: any) {
    return this.lostReasonsService.create(req['organization'].id, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLostReasonDto,
    @Req() req: any,
  ) {
    return this.lostReasonsService.update(id, req['organization'].id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.lostReasonsService.delete(id, req['organization'].id);
    return { deleted: true, id };
  }
}
