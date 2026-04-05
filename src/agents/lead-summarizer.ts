import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmMessage } from '../llm/llm.interface.js';
import { PipelineStage, Temperature } from '@prisma/client';

export interface LeadSummary {
  headline: string;
  situation: string;
  keyInsights: string[];
  riskFactors: string[];
  recommendedNextSteps: string[];
  language: string;
}

/**
 * Lead Summarization Agent
 *
 * Generates a structured, human-readable summary of a lead's current state
 * and history for an SDR to quickly understand where they stand.
 *
 * Used for:
 * - Daily pipeline reviews
 * - Handoff between SDRs
 * - CRM record snapshots
 */
@Injectable()
export class LeadSummarizer {
  private readonly logger = new Logger(LeadSummarizer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Generates a structured summary for a lead.
   */
  async summarize(
    leadEmail: string,
    organizationId: string,
    language = 'es',
  ): Promise<LeadSummary> {
    const ctx = await this.loadSummaryContext(leadEmail, organizationId);

    const systemPrompt = this.getSystemPrompt(language);
    const userPrompt = this.buildUserPrompt(ctx, language);

    const response = await this.llm.completeAsUser(
      userPrompt,
      systemPrompt,
      { temperature: 0.3, maxTokens: 800 },
    );

    return this.parseSummary(response.content, language);
  }

  private async loadSummaryContext(
    email: string,
    organizationId: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { email, organizationId },
      include: {
        stageTransitions: { orderBy: { createdAt: 'desc' }, take: 10 },
        actionLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        tags: true,
      },
    });

    if (!lead) return null;

    return {
      email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      stage: lead.stage as PipelineStage,
      temperature: lead.temperature as Temperature,
      dealValue: lead.dealValue ? Number(lead.dealValue) : null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      campaignName: lead.campaignName ?? null,
      tags: lead.tags.map((t: { tagType: string; tagValue: string }) => `${t.tagType}:${t.tagValue}`),
      stageHistory: lead.stageTransitions.map((t: { fromStage: string; toStage: string; createdAt: Date }) => ({
        from: t.fromStage,
        to: t.toStage,
        date: t.createdAt.toISOString().split('T')[0],
      })),
      interactionHistory: lead.actionLogs.map((l: { id: string; createdAt: Date }) => ({
        id: l.id,
        date: l.createdAt.toISOString().split('T')[0],
      })),
    };
  }

  private getSystemPrompt(language: string): string {
    const prompts: Record<string, string> = {
      es: `Eres Wolverine, el asistente de SDR de afrus. Genera un resumen estructurado de leads para SDRs. Responde SOLO en JSON válido:
{
  "headline": "título breve de una línea (máx 80 chars)",
  "situation": "situación actual del lead en 2-3 frases (máx 200 chars)",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "riskFactors": ["factor de riesgo 1", "factor de riesgo 2"],
  "recommendedNextSteps": ["paso 1", "paso 2"],
  "language": "es"
}`,
      en: `You are Wolverine, afrus's SDR assistant. Generate structured lead summaries for SDRs. Respond ONLY in valid JSON:
{
  "headline": "brief one-line title (max 80 chars)",
  "situation": "current lead situation in 2-3 sentences (max 200 chars)",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "riskFactors": ["risk factor 1", "risk factor 2"],
  "recommendedNextSteps": ["step 1", "step 2"],
  "language": "en"
}`,
      pt: `Você é Wolverine, assistente de SDR da afrus. Gere resumos estruturados de leads para SDRs. Responda APENAS em JSON válido:
{
  "headline": "título breve de uma linha (máx 80 chars)",
  "situation": "situação atual do lead em 2-3 frases (máx 200 chars)",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "riskFactors": ["fator de risco 1", "fator de risco 2"],
  "recommendedNextSteps": ["passo 1", "passo 2"],
  "language": "pt"
}`,
    };
    return prompts[language] ?? prompts['es'];
  }

  private buildUserPrompt(ctx: any, language: string): string {
    const stageLabel = { NEW: 'Nuevo', SCHEDULED: 'Programado', MET: 'Reunido', QUALIFIED: 'Calificado', PROPOSED: 'Propuesta enviada', NEGOTIATING: 'En negociación', FUTURE: 'En espera', WON: 'Ganado', LOST: 'Perdido' };
    const tempLabel = { HOT: '🔥 Hot', WARM: '☀️ Warm', COLD: '❄️ Cold' };

    const stageName = stageLabel[ctx?.stage] ?? ctx?.stage ?? 'Desconocido';
    const tempName = tempLabel[ctx?.temperature] ?? ctx?.temperature ?? 'Desconocida';

    return `Lead: ${ctx?.email ?? 'N/A'}
Nombre: ${ctx?.firstName ?? ''} ${ctx?.lastName ?? ''}
Etapa: ${stageName}
Temperatura: ${tempName}
Valor: ${ctx?.dealValue ? `$${ctx.dealValue}` : 'No definido'}
Días en pipeline: ${ctx?.daysInPipeline ?? 'N/A'}
Etiquetas: ${ctx?.tags?.join(', ') || 'Ninguna'}
Historial de etapas: ${ctx?.stageHistory?.map((s: any) => `${s.from}→${s.to} (${s.date})`).join(' | ') || 'Sin cambios'}
Interacciones registradas: ${ctx?.interactionHistory?.length ?? 0}

Genera un resumen estructurado en ${language}.`;
  }

  private parseSummary(raw: string, language: string): LeadSummary {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        headline: String(parsed.headline ?? ''),
        situation: String(parsed.situation ?? ''),
        keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.map(String) : [],
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors.map(String) : [],
        recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
          ? parsed.recommendedNextSteps.map(String)
          : [],
        language: String(parsed.language ?? language),
      };
    } catch (err) {
      this.logger.warn(`Failed to parse summary: ${err}`);
      return {
        headline: 'Resumen no disponible',
        situation: 'No se pudo generar el resumen. Revisar manualmente.',
        keyInsights: [],
        riskFactors: [],
        recommendedNextSteps: [],
        language,
      };
    }
  }
}
