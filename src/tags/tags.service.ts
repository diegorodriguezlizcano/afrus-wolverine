import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlmaWebhookClientService } from '../alma/alma-webhook-client.service.js';
import { TagType, TAG_TYPE_PREFIXES } from './tag-type.enum.js';
import type { Tag, Lead, Organization } from '@prisma/client';

export interface ParsedTag {
  type: TagType;
  value: string;
}

export interface AssignedTag {
  type: string;
  value: string;
}

export interface AssignTagsResult {
  success: boolean;
  leadEmail: string;
  assignedTags: AssignedTag[];
  actionTagsTriggered: string[];
  almaCallbacks: AlmaCallback[];
}

export interface AlmaCallback {
  actionTag: string;
  status: string;
  callbackId?: string;
}

type LeadWithOrg = Lead & { organization: Organization };

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly almaWebhookClient: AlmaWebhookClientService,
  ) {}

  /**
   * Assigns tags to a lead atomically.
   * Parses tag strings, validates, upserts to DB, triggers ALMA webhooks for action tags.
   */
  async assignTags(
    leadEmail: string,
    tags: string[],
    assignedBy: string | null,
    organizationId: string,
    orgApiKey: string,
  ): Promise<AssignTagsResult> {
    if (!tags || tags.length === 0) {
      throw new BadRequestException('Tags array must not be empty');
    }

    const parsedTags = this.parseTags(tags);
    const actionTags = this.detectActionTags(parsedTags);
    const currentTags = await this.getLeadTags(leadEmail, organizationId);

    const lead = await this.prisma.lead.findFirst({
      where: { email: leadEmail, organizationId },
      include: { organization: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with email ${leadEmail} not found`);
    }

    // Upsert tags (one per type)
    const assignedTags: AssignedTag[] = [];
    for (const parsed of parsedTags) {
      const tag = await this.prisma.tag.upsert({
        where: {
          leadEmail_organizationId_tagType: {
            leadEmail,
            organizationId,
            tagType: parsed.type,
          },
        },
        update: {
          tagValue: parsed.value,
          updatedAt: new Date(),
        },
        create: {
          organizationId,
          leadEmail,
          tagType: parsed.type,
          tagValue: parsed.value,
        },
      });
      assignedTags.push({ type: tag.tagType as string, value: tag.tagValue });
    }

    // Trigger ALMA webhooks for each action tag
    const almaCallbacks: AlmaCallback[] = [];
    const systemUserId = await this.getSystemUserId(organizationId);

    for (const actionTag of actionTags) {
      const actionTagFull = `action:${actionTag}`;
      const allTagStrings = [
        ...currentTags.map((t) => `${t.tagType.toLowerCase()}:${t.tagValue}`),
        ...tags,
      ];

      const payload = this.buildAlmaPayload(
        actionTag,
        actionTagFull,
        lead,
        assignedBy,
        allTagStrings,
      );

      // Create ActionTagLog BEFORE firing webhook (optimistic)
      const actionTagLog = await this.prisma.actionTagLog.create({
        data: {
          organizationId,
          leadEmail,
          actionTag,
          status: 'TRIGGERED',
          triggeredById: systemUserId,
          almaResponse: undefined,
        },
      });

      try {
        const result = await this.almaWebhookClient.trigger(payload, orgApiKey);

        await this.prisma.actionTagLog.update({
          where: { id: actionTagLog.id },
          data: {
            status: 'COMPLETED',
            almaResponse: result as unknown as object,
            completedAt: new Date(),
          },
        });

        almaCallbacks.push({
          actionTag,
          status: 'success',
          callbackId: result.callbackId,
        });
      } catch (err) {
        await this.prisma.actionTagLog.update({
          where: { id: actionTagLog.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });

        this.logger.error(
          `Failed to trigger ALMA webhook for actionTag=${actionTag}: ${(err as Error).message ?? String(err)}`,
        );

        almaCallbacks.push({
          actionTag,
          status: 'failed',
        });
      }
    }

    return {
      success: true,
      leadEmail,
      assignedTags,
      actionTagsTriggered: actionTags,
      almaCallbacks,
    };
  }

  /**
   * Parses an array of tag strings into ParsedTag objects.
   * Validates format and type.
   */
  parseTags(tags: string[]): ParsedTag[] {
    if (!tags || tags.length === 0) {
      throw new BadRequestException('Tags array must not be empty');
    }

    const seenTypes = new Set<TagType>();
    const parsed: ParsedTag[] = [];

    for (const tag of tags) {
      if (!tag || typeof tag !== 'string') {
        throw new BadRequestException(`Invalid tag: ${tag}`);
      }

      const colonIndex = tag.indexOf(':');
      if (colonIndex === -1 || colonIndex === 0 || colonIndex === tag.length - 1) {
        throw new BadRequestException(
          `Invalid tag format "${tag}". Expected format: <type>:<value>`,
        );
      }

      const rawType = tag.substring(0, colonIndex).toLowerCase();
      const value = tag.substring(colonIndex + 1);

      const tagType = TAG_TYPE_PREFIXES[rawType];
      if (!tagType) {
        const validTypes = Object.keys(TAG_TYPE_PREFIXES).join(', ');
        throw new BadRequestException(
          `Unknown tag type "${rawType}". Valid types: ${validTypes}`,
        );
      }

      if (seenTypes.has(tagType)) {
        throw new BadRequestException(
          `Duplicate tag type "${rawType}" in request. One tag per type allowed.`,
        );
      }
      seenTypes.add(tagType);

      parsed.push({ type: tagType, value });
    }

    return parsed;
  }

  /**
   * Detects and returns action tag values from parsed tags.
   */
  detectActionTags(parsedTags: ParsedTag[]): string[] {
    return parsedTags
      .filter((t) => t.type === TagType.ACTION)
      .map((t) => t.value);
  }

  /**
   * Returns all tags for a lead.
   */
  async getLeadTags(leadEmail: string, organizationId: string): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: { leadEmail, organizationId },
    });
  }

  /**
   * Finds a system user (admin) for the org, used as triggeredById in ActionTagLog.
   */
  private async getSystemUserId(organizationId: string): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { organizationId, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) return admin.id;

    // Fallback: use any user
    const user = await this.prisma.user.findFirst({
      where: { organizationId },
    });
    if (user) return user.id;

    // Last resort: return org id as placeholder (ActionTagLog needs a valid UUID)
    return organizationId;
  }

  /**
   * Removes a single tag (by type) from a lead.
   */
  async removeTag(leadEmail: string, tagType: string, organizationId: string): Promise<void> {
    await this.prisma.tag.deleteMany({
      where: {
        leadEmail,
        organizationId,
        tagType: tagType as TagType,
      },
    });
  }

  /**
   * Removes all tags from a lead.
   */
  async removeAllTags(leadEmail: string, organizationId: string): Promise<void> {
    await this.prisma.tag.deleteMany({
      where: { leadEmail, organizationId },
    });
  }

  private buildAlmaPayload(
    actionTag: string,
    actionTagFull: string,
    lead: LeadWithOrg,
    assignedBy: string | null,
    allTags: string[],
  ) {
    return {
      event: 'action_tag_assigned' as const,
      actionTag,
      actionTagFull,
      lead: {
        email: lead.email,
        firstName: lead.firstName ?? '',
        lastName: lead.lastName ?? '',
        phone: lead.phone ?? null,
        title: null,
        contactRole: null,
        stage: lead.stage,
        temperature: lead.temperature,
        campaignName: null,
        utmCampaign: null,
        url: null,
      },
      organization: {
        orgId: lead.organization.id,
        name: lead.organization.name,
        domain: null,
        isCustomer: false,
      },
      context: {
        assignedBy,
        assignedAt: new Date().toISOString(),
        allTags,
      },
      wolverine: {
        version: '0.1.0',
        instanceId: process.env.WOLVERINE_INSTANCE_ID ?? 'local',
      },
    };
  }
}
