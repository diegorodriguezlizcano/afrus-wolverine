import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlmaWebhookClientService } from '../alma/alma-webhook-client.service.js';
import { TagType, TAG_TYPE_PREFIXES } from './tag-type.enum.js';

export interface ParsedTag {
  type: TagType;
  value: string;
}

export interface AssignedTag {
  type: TagType;
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
    // Validate tags array is not empty
    if (!tags || tags.length === 0) {
      throw new BadRequestException('Tags array must not be empty');
    }

    // Parse tags
    const parsedTags = this.parseTags(tags);

    // Detect action tags
    const actionTags = this.detectActionTags(parsedTags);

    // Get all current tags for the lead (for alma payload context)
    const currentTags = await this.getLeadTags(leadEmail, organizationId);

    // Fetch lead and org data for ALMA payload
    const lead = await this.prisma.lead.findUnique({
      where: { email_orgId: { email: leadEmail, orgId: organizationId } },
      include: { org: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with email ${leadEmail} not found`);
    }

    // Upsert tags (one per type)
    const assignedTags: AssignedTag[] = [];
    for (const parsed of parsedTags) {
      const tag = await this.prisma.tag.upsert({
        where: {
          orgId_leadEmail_type: {
            orgId: organizationId,
            leadEmail,
            type: parsed.type,
          },
        },
        update: {
          value: parsed.value,
          assignedBy,
          assignedAt: new Date(),
        },
        create: {
          orgId: organizationId,
          leadEmail,
          type: parsed.type,
          value: parsed.value,
          assignedBy,
        },
      });
      assignedTags.push({ type: tag.type, value: tag.value });
    }

    // Trigger ALMA webhooks for each action tag
    const almaCallbacks: AlmaCallback[] = [];
    for (const actionTag of actionTags) {
      const actionTagFull = `action:${actionTag}`;
      const allTagStrings = [
        ...currentTags.map((t) => `${t.type.toLowerCase()}:${t.value}`),
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
          orgId: organizationId,
          leadEmail,
          actionTag,
          actionTagFull,
          payload: payload as Record<string, unknown>,
          status: 'pending',
        },
      });

      try {
        const result = await this.almaWebhookClient.trigger(payload, orgApiKey);

        // Update log with success
        await this.prisma.actionTagLog.update({
          where: { id: actionTagLog.id },
          data: {
            status: 'success',
            almaResponse: result as Record<string, unknown>,
            completedAt: new Date(),
          },
        });

        almaCallbacks.push({
          actionTag,
          status: 'success',
          callbackId: result.callbackId,
        });
      } catch (err) {
        // Update log with failure
        await this.prisma.actionTagLog.update({
          where: { id: actionTagLog.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
          },
        });

        this.logger.error(
          `Failed to trigger ALMA webhook for actionTag=${actionTag}: ${(err as Error).message}`,
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
    const seenTypes = new Set<TagType>();
    const parsed: ParsedTag[] = [];

    for (const tag of tags) {
      // Validate format
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

      // One tag per type invariant
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
  async getLeadTags(leadEmail: string, organizationId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { leadEmail, orgId: organizationId },
    });
    return tags;
  }

  private buildAlmaPayload(
    actionTag: string,
    actionTagFull: string,
    lead: {
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      title: string | null;
      contactRole: string | null;
      stage: string;
      temperature: string;
      campaignName: string | null;
      utmCampaign: string | null;
      url: string | null;
      org: { organizationId: string; name: string; domain: string | null; isCustomer: boolean };
    },
    assignedBy: string | null,
    allTags: string[],
  ) {
    return {
      event: 'action_tag_assigned' as const,
      actionTag,
      actionTagFull,
      lead: {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        title: lead.title,
        contactRole: lead.contactRole,
        stage: lead.stage,
        temperature: lead.temperature,
        campaignName: lead.campaignName,
        utmCampaign: lead.utmCampaign,
        url: lead.url,
      },
      organization: {
        orgId: lead.org.organizationId,
        name: lead.org.name,
        domain: lead.org.domain,
        isCustomer: lead.org.isCustomer,
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
