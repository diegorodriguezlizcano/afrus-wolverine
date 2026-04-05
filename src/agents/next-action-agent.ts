import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmMessage } from '../llm/llm.interface.js';
import { PipelineStage, Temperature, ActionStatus, Prisma } from '@prisma/client';

/**
 * Next Action Recommendation — structured output types.
 */
export interface NextActionRecommendation {
  actionType: ActionType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reason: string;
  suggestedEmailSubject?: string;
  talkTrack?: string;
  followUpDays?: number;
}

export type ActionType =
  | 'send_email'
  | 'send_whatsapp'
  | 'schedule_meeting'
  | 'send_linkedin_message'
  | 'wait'
  | 'close_won'
  | 'close_lost'
  | 'revisit_later';

/**
 * Lead context for recommendation generation.
 */
export interface LeadContext {
  leadEmail: string;
  firstName: string | null;
  stage: PipelineStage;
  temperature: Temperature;
  hoursInStage: number;
  daysInPipeline: number;
  lastContactedAt: Date | null;
  interactionCount: number;
  dealValue: number | null;
  tags: string[];
  orgLanguage: string;
  campaignName: string | null;
}

/**
 * Next-Action Recommendation Agent
 *
 * Loads full lead + org context, queries the LLM with a stage-specific
 * prompt template, and returns a structured NextActionRecommendation.
 *
 * Always presented to the SDR for review — never auto-executed.
 */
@Injectable()
export class NextActionAgent {
  private readonly logger = new Logger(NextActionAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Generates a next-action recommendation for a lead.
   */
  async recommend(
    leadEmail: string,
    organizationId: string,
  ): Promise<NextActionRecommendation> {
    // ── 1. Load lead context ──────────────────────────────────────────────
    const ctx = await this.loadLeadContext(leadEmail, organizationId);
    if (!ctx) {
      throw new Error(`Lead ${leadEmail} not found for org ${organizationId}`);
    }

    // ── 2. Select prompt template ────────────────────────────────────────
    const systemPrompt = this.getSystemPrompt(ctx.orgLanguage);
    const userPrompt = this.buildUserPrompt(ctx);

    // ── 3. Call LLM ────────────────────────────────────────────────────
    const response = await this.llm.completeAsUser(
      userPrompt,
      systemPrompt,
      { temperature: 0.4, maxTokens: 600 },
    );

    // ── 4. Parse structured output ──────────────────────────────────────
    const recommendation = this.parseRecommendation(response.content, ctx);

    // ── 5. Log the recommendation ─────────────────────────────────────
    await this.logRecommendation(leadEmail, organizationId, ctx, recommendation);

    return recommendation;
  }

  /**
   * Returns recommendation history for a lead.
   */
  async getRecommendationHistory(leadEmail: string, organizationId: string) {
    return this.prisma.actionTagLog.findMany({
      where: {
        leadEmail,
        organizationId,
        actionTag: 'next_action_recommendation',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async loadLeadContext(
    email: string,
    organizationId: string,
  ): Promise<LeadContext | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { email, organizationId },
      include: {
        actionLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!lead) return null;

    // Load tags separately (Tag relation)
    const tags = await this.prisma.tag.findMany({
      where: { leadEmail: email, organizationId },
      select: { tagType: true, tagValue: true },
    });

    const orgLanguage = 'es'; // TODO: add language field to Organization schema
    const tagStrings = tags.map((t) => `${t.tagType}:${t.tagValue}`);

    const now = new Date();
    const hoursInStage = lead.updatedAt
      ? (now.getTime() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60)
      : 0;
    const daysInPipeline = lead.createdAt
      ? Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const lastInteraction = lead.actionLogs[0]?.createdAt ?? null;

    return {
      leadEmail: email,
      firstName: lead.firstName,
      stage: lead.stage as PipelineStage,
      temperature: lead.temperature as Temperature,
      hoursInStage: Math.round(hoursInStage),
      daysInPipeline,
      lastContactedAt: lastInteraction,
      interactionCount: lead.actionLogs.length,
      dealValue: lead.dealValue ? Number(lead.dealValue) : null,
      tags: tagStrings,
      orgLanguage,
      campaignName: null,
    };
  }

  private getSystemPrompt(language: string): string {
    const prompts: Record<string, string> = {
      es: `Eres Wolverine, el asistente de SDR de afrus. Para cada lead, analizas su contexto y recomiendas la siguiente mejor acción. Responde SOLO en JSON válido con este formato exacto:
{
  "actionType": "send_email|send_whatsapp|schedule_meeting|send_linkedin_message|wait|close_won|close_lost|revisit_later",
  "priority": "low|medium|high|urgent",
  "reason": "explicación breve del por qué de esta recomendación (máx 150 chars)",
  "suggestedEmailSubject": "asunto sugerido del email (si aplica, si no null)",
  "talkTrack": "guion breve para la conversación (máx 200 chars, null si no aplica)",
  "followUpDays": número de días para hacer seguimiento (null si wait o close_*)`,
      en: `You are Wolverine, afrus's SDR assistant. For each lead, analyze context and recommend the next best action. Respond ONLY in valid JSON with this exact format:
{
  "actionType": "send_email|send_whatsapp|schedule_meeting|send_linkedin_message|wait|close_won|close_lost|revisit_later",
  "priority": "low|medium|high|urgent",
  "reason": "brief explanation of why (max 150 chars)",
  "suggestedEmailSubject": "suggested email subject (null if not applicable)",
  "talkTrack": "brief talk track (max 200 chars, null if not applicable)",
  "followUpDays": number of days to follow up (null if wait or close_*)`,
      pt: `Você é Wolverine, assistente de SDR da afrus. Para cada lead, analise o contexto e recomende a próxima melhor ação. Responda APENAS em JSON válido com este formato:
{
  "actionType": "send_email|send_whatsapp|schedule_meeting|send_linkedin_message|wait|close_won|close_lost|revisit_later",
  "priority": "low|medium|high|urgent",
  "reason": "breve explicação do porquê (máx 150 chars)",
  "suggestedEmailSubject": "sugestão de assunto do email (null se não aplicável)",
  "talkTrack": "roteiro breve (máx 200 chars, null se não aplicável)",
  "followUpDays": número de dias para seguimiento (null se wait ou close_*)`,
    };
    return prompts[language] ?? prompts['es'];
  }

  private buildUserPrompt(ctx: LeadContext): string {
    return `Lead: ${ctx.leadEmail}
Name: ${ctx.firstName ?? 'Desconocido'}
Stage: ${ctx.stage}
Temperature: ${ctx.temperature}
Hours in stage: ${ctx.hoursInStage}
Days in pipeline: ${ctx.daysInPipeline}
Interactions so far: ${ctx.interactionCount}
Last contacted: ${ctx.lastContactedAt ? new Date(ctx.lastContactedAt).toLocaleDateString() : 'Nunca'}
Deal value: ${ctx.dealValue ? `$${ctx.dealValue}` : 'No definido'}
Campaign: ${ctx.campaignName ?? 'N/A'}
Tags: ${ctx.tags.join(', ') || 'Ninguno'}

Based on this context, recommend the single best next action for the SDR. Consider:
- If temperature=HOT and stage=QUALIFIED: suggest sending proposal
- If hoursInStage > 72 and stage=SCHEDULED: suggest follow-up
- If temperature=COLD and daysInPipeline > 7: suggest warming up or closing
- If stage=NEGOTIATING: focus on urgency and deal close
- Always prioritize the lead's interests and time

Respond in JSON only.`;
  }

  private parseRecommendation(
    raw: string,
    ctx: LeadContext,
  ): NextActionRecommendation {
    try {
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      return {
        actionType: (parsed.actionType as ActionType) ?? 'send_email',
        priority: (parsed.priority as NextActionRecommendation['priority']) ?? 'medium',
        reason: String(parsed.reason ?? 'Recommendation generated'),
        suggestedEmailSubject: parsed.suggestedEmailSubject as string | undefined,
        talkTrack: parsed.talkTrack as string | undefined,
        followUpDays: typeof parsed.followUpDays === 'number' ? parsed.followUpDays : undefined,
      };
    } catch (err) {
      this.logger.warn(`Failed to parse LLM recommendation: ${err}. Using fallback.`);
      return {
        actionType: 'send_email',
        priority: 'medium',
        reason: `Lead in ${ctx.stage} stage, temperature ${ctx.temperature}. Awaiting SDR review.`,
        followUpDays: 1,
      };
    }
  }

  private async logRecommendation(
    leadEmail: string,
    organizationId: string,
    _ctx: LeadContext,
    recommendation: NextActionRecommendation,
  ) {
    try {
      await this.prisma.actionTagLog.create({
        data: {
          leadEmail,
          organizationId,
          actionTag: 'next_action_recommendation',
          status: ActionStatus.COMPLETED,
          almaResponse: recommendation as unknown as Prisma.InputJsonValue,
          triggeredById: 'wolverine-agent',
          triggeredAt: new Date(),
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log recommendation for ${leadEmail}: ${err}`);
    }
  }
}
