import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStage, Temperature } from '@prisma/client';

export interface ConversationDraft {
  channel: 'email' | 'whatsapp' | 'linkedin';
  subject?: string;
  body: string;
  tone: 'formal' | 'semi-formal' | 'casual';
  estimatedLength: 'short' | 'medium' | 'long';
}

export interface DraftOptions {
  channel: 'email' | 'whatsapp' | 'linkedin';
  draftType: 'initial' | 'follow_up' | 'proposal' | 'meeting_request' | 'closing' | 're-engagement';
  language?: 'es' | 'en' | 'pt';
}

/**
 * Conversation Drafting Agent
 *
 * Generates personalized outbound communication drafts for SDRs.
 * Always presented for review before sending — never auto-sent.
 */
@Injectable()
export class ConversationDraftAgent {
  private readonly logger = new Logger(ConversationDraftAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async draft(
    leadEmail: string,
    organizationId: string,
    options: DraftOptions,
  ): Promise<ConversationDraft> {
    const ctx = await this.loadDraftContext(leadEmail, organizationId);
    const language = options.language ?? 'es';

    const systemPrompt = this.getSystemPrompt(options.channel, options.draftType, language);
    const userPrompt = this.buildUserPrompt(ctx, options, language);

    const response = await this.llm.completeAsUser(
      userPrompt,
      systemPrompt,
      { temperature: 0.6, maxTokens: 1000 },
    );

    return this.parseDraft(response.content, options.channel);
  }

  private async loadDraftContext(email: string, organizationId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { email, organizationId },
      include: {
        tags: true,
        stageTransitions: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });

    if (!lead) return null;

    return {
      email,
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      stage: lead.stage,
      temperature: lead.temperature,
      dealValue: lead.dealValue ? Number(lead.dealValue) : null,
      tags: lead.tags.map((t) => `${t.tagType}:${t.tagValue}`),
      daysInPipeline: Math.floor(
        (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      ),
      lastStageChange: lead.updatedAt.toISOString().split('T')[0],
    };
  }

  private getSystemPrompt(channel: string, draftType: string, language: string): string {
    const prompts: Record<string, string> = {
      email_initial_es: `Eres Wolverine, asistente de SDR de afrus. Redacta emails de prospección personalizados. Responde SOLO en JSON válido:
{"subject":"asunto (máx 60 chars)","body":"cuerpo completo (máx 400 chars)","tone":"semi-formal","estimatedLength":"medium"}`,
      email_follow_up_es: `Eres Wolverine. Redacta emails de seguimiento. Responde SOLO en JSON válido:
{"subject":"asunto seguimiento (máx 60 chars)","body":"cuerpo follow-up (máx 300 chars)","tone":"semi-formal","estimatedLength":"short"}`,
      email_proposal_es: `Eres Wolverine. Redacta emails de propuesta. Responde SOLO en JSON válido:
{"subject":"asunto propuesta (máx 60 chars)","body":"cuerpo propuesta (máx 500 chars)","tone":"formal","estimatedLength":"long"}`,
      email_initial_en: `You are Wolverine, afrus SDR assistant. Write personalized outreach emails. Respond ONLY in valid JSON:
{"subject":"subject (max 60 chars)","body":"complete body (max 400 chars)","tone":"semi-formal","estimatedLength":"medium"}`,
      email_follow_up_en: `You are Wolverine. Write follow-up emails. Respond ONLY in valid JSON:
{"subject":"follow-up subject (max 60 chars)","body":"follow-up body (max 300 chars)","tone":"semi-formal","estimatedLength":"short"}`,
      email_proposal_en: `You are Wolverine. Write proposal emails. Respond ONLY in valid JSON:
{"subject":"proposal subject (max 60 chars)","body":"proposal body (max 500 chars)","tone":"formal","estimatedLength":"long"}`,
    };
    const key = `${channel}_${draftType}_${language}`;
    return prompts[key] ?? prompts[`${channel}_initial_${language}`] ?? prompts[`${channel}_initial_es`] ?? '';
  }

  private buildUserPrompt(ctx: any, options: DraftOptions, language: string): string {
    const stageLabel: Record<string, string> = {
      NEW: 'Nuevo', SCHEDULED: 'Programado', MET: 'Reunido', QUALIFIED: 'Calificado',
      PROPOSED: 'Propuesta', NEGOTIATING: 'En negociación', FUTURE: 'En espera',
      WON: 'Ganado', LOST: 'Perdido',
    };

    return `Lead: ${ctx?.email ?? 'N/A'}
Nombre: ${ctx?.firstName ?? ''} ${ctx?.lastName ?? ''}
Etapa actual: ${stageLabel[ctx?.stage as string] ?? ctx?.stage ?? 'Desconocida'}
Temperatura: ${ctx?.temperature ?? 'N/A'}
Valor del negocio: ${ctx?.dealValue ? `$${ctx.dealValue}` : 'No definido'}
Etiquetas: ${ctx?.tags?.join(', ') || 'Ninguna'}
Último cambio de etapa: ${ctx?.lastStageChange ?? 'N/A'}

Redacta un mensaje de ${options.draftType} por ${options.channel} en ${language}. Personaliza el mensaje según el contexto del lead.`;
  }

  private parseDraft(raw: string, channel: string): ConversationDraft {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        channel: channel as ConversationDraft['channel'],
        subject: parsed.subject as string | undefined,
        body: String(parsed.body ?? ''),
        tone: (parsed.tone as ConversationDraft['tone']) ?? 'semi-formal',
        estimatedLength: (parsed.estimatedLength as ConversationDraft['estimatedLength']) ?? 'medium',
      };
    } catch (err) {
      this.logger.warn(`Failed to parse draft: ${err}`);
      return {
        channel: channel as ConversationDraft['channel'],
        body: 'Hola [Nombre], ¿cómo estás? Quería hacerte seguimiento sobre nuestra conversación. ¿Tienes disponibilidad para una llamada esta semana?\n\nSaludos cordiales',
        tone: 'semi-formal',
        estimatedLength: 'short',
      };
    }
  }
}
