import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ExtractionPipelineService } from './extraction-pipeline.service.js';
import { OrganizationGuard } from '../common/guards/organization.guard.js';

export class TriggerExtractionDto {
  syncTags!: string[]; // one or more sync tag values
}

@Controller('extract')
@UseGuards(OrganizationGuard)
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionPipelineService) {}

  /**
   * POST /extract/trigger
   * Triggers extraction for one or more sync tags.
   * Body: { syncTags: ["fundraiser", "donor-2024"] }
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async trigger(@Body() dto: TriggerExtractionDto, @Req() req: any) {
    if (!dto.syncTags || dto.syncTags.length === 0) {
      return { success: false, message: 'At least one sync tag is required' };
    }

    const results = await Promise.allSettled(
      dto.syncTags.map((syncTag) =>
        this.extractionService.runExtraction(req['organization'].id, syncTag),
      ),
    );

    const responses = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return {
          syncTag: dto.syncTags[i],
          success: true,
          ...result.value,
        };
      } else {
        return {
          syncTag: dto.syncTags[i],
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });

    return {
      totalTriggered: dto.syncTags.length,
      results: responses,
    };
  }
}
