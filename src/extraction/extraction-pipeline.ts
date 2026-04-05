import { PipelineStage, Temperature } from '@prisma/client';
import type { AfrusLead } from '../afrus-api/afrus-api.service.js';

/**
 * Maps an afrus lead to Wolverine lead data for upsert.
 */
export interface MappedLead {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  stage: PipelineStage;
  temperature: Temperature;
  dealValue: number | null;
  originTag: string | null;
  afrusLeadId: string;
}

/**
 * Pure mapping logic — no Nest.js deps, no DB access.
 * Transforms an afrus lead into Wolverine's schema.
 */
export class ExtractionPipeline {
  /**
   * Maps an afrus lead to Wolverine lead fields.
   */
  static mapAfrusLeadToWolverine(lead: AfrusLead): MappedLead {
    return {
      email: lead.email?.toLowerCase().trim() ?? '',
      firstName: lead.first_name ?? null,
      lastName: lead.last_name ?? null,
      phone: lead.phone ?? null,
      stage: this.mapAfrusStage(lead.stage),
      temperature: this.mapAfrusTemperature(lead.temperature),
      dealValue: null, // Conversion amount is a separate API call
      originTag: this.extractOriginTag(lead),
      afrusLeadId: lead.afrus_lead_id,
    };
  }

  /**
   * Maps afrus stage string to PipelineStage enum.
   */
  static mapAfrusStage(stage?: string): PipelineStage {
    const map: Record<string, PipelineStage> = {
      new: PipelineStage.NEW,
      scheduled: PipelineStage.SCHEDULED,
      met: PipelineStage.MET,
      qualified: PipelineStage.QUALIFIED,
      proposed: PipelineStage.PROPOSED,
      negotiating: PipelineStage.NEGOTIATING,
      future: PipelineStage.FUTURE,
      won: PipelineStage.WON,
      lost: PipelineStage.LOST,
    };
    return map[stage?.toLowerCase() ?? ''] ?? PipelineStage.NEW;
  }

  /**
   * Maps afrus temperature string to Temperature enum.
   */
  static mapAfrusTemperature(temp?: string): Temperature {
    const map: Record<string, Temperature> = {
      hot: Temperature.HOT,
      warm: Temperature.WARM,
      cold: Temperature.COLD,
    };
    return map[temp?.toLowerCase() ?? ''] ?? Temperature.COLD;
  }

  /**
   * Extracts the origin tag from afrus lead tags.
   * Looks for tags like "origin:linkedin", "origin:website", etc.
   */
  static extractOriginTag(lead: AfrusLead): string | null {
    const tags: string[] = lead.tags ?? [];
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (lower.startsWith('origin:')) {
        return lower.replace('origin:', '').trim();
      }
    }
    return null;
  }

  /**
   * Extracts the stage tag from afrus lead tags.
   */
  static extractStageTag(lead: AfrusLead): string | null {
    const tags: string[] = lead.tags ?? [];
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (lower.startsWith('stage:')) {
        return lower.replace('stage:', '').trim();
      }
    }
    return null;
  }

  /**
   * Extracts the temperature tag from afrus lead tags.
   */
  static extractTempTag(lead: AfrusLead): string | null {
    const tags: string[] = lead.tags ?? [];
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (lower.startsWith('temp:')) {
        return lower.replace('temp:', '').trim();
      }
    }
    return null;
  }
}
