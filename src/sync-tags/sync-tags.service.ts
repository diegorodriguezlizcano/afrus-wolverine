import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSyncTagDto, UpdateSyncTagDto } from './dto/create-sync-tag.dto.js';

@Injectable()
export class SyncTagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all sync tags for an organization.
   */
  async list(organizationId: string) {
    return this.prisma.syncTag.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Gets a sync tag by ID.
   */
  async getById(id: string, organizationId: string) {
    const tag = await this.prisma.syncTag.findFirst({
      where: { id, organizationId },
    });
    if (!tag) {
      throw new NotFoundException(`Sync tag with id=${id} not found`);
    }
    return tag;
  }

  /**
   * Gets a sync tag by its Wolverine tagValue (unique per org).
   */
  async getByTagValue(tagValue: string, organizationId: string) {
    const tag = await this.prisma.syncTag.findFirst({
      where: { tagValue, organizationId },
    });
    if (!tag) {
      throw new NotFoundException(`Sync tag "${tagValue}" not found`);
    }
    return tag;
  }

  /**
   * Creates a new sync tag.
   */
  async create(organizationId: string, dto: CreateSyncTagDto) {
    // Check for duplicate tagValue within this org
    const existing = await this.prisma.syncTag.findFirst({
      where: { tagValue: dto.tagValue, organizationId },
    });
    if (existing) {
      throw new ConflictException(
        `Sync tag with value "${dto.tagValue}" already exists in this organization`,
      );
    }

    return this.prisma.syncTag.create({
      data: {
        organizationId,
        tagValue: dto.tagValue,
        afrusTagName: dto.afrusTagName,
        description: dto.description,
      },
    });
  }

  /**
   * Updates a sync tag by ID.
   */
  async update(id: string, organizationId: string, dto: UpdateSyncTagDto) {
    await this.getById(id, organizationId); // ensure it exists

    // If renaming tagValue, check no conflict
    if (dto.tagValue) {
      const conflict = await this.prisma.syncTag.findFirst({
        where: {
          tagValue: dto.tagValue,
          organizationId,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(
          `Sync tag with value "${dto.tagValue}" already exists`,
        );
      }
    }

    return this.prisma.syncTag.update({
      where: { id },
      data: {
        ...(dto.tagValue !== undefined && { tagValue: dto.tagValue }),
        ...(dto.afrusTagName !== undefined && { afrusTagName: dto.afrusTagName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Deactivates a sync tag (soft-delete).
   */
  async deactivate(id: string, organizationId: string) {
    return this.update(id, organizationId, { isActive: false });
  }

  /**
   * Deletes a sync tag.
   */
  async delete(id: string, organizationId: string) {
    await this.getById(id, organizationId);
    await this.prisma.syncTag.delete({ where: { id } });
  }
}
