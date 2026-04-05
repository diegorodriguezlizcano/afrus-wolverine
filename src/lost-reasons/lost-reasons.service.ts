import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLostReasonDto, UpdateLostReasonDto } from './dto/create-lost-reason.dto.js';

@Injectable()
export class LostReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, includeInactive = false) {
    return this.prisma.lostReason.findMany({
      where: {
        organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getById(id: string, organizationId: string) {
    const reason = await this.prisma.lostReason.findFirst({
      where: { id, organizationId },
    });
    if (!reason) {
      throw new NotFoundException(`Lost reason with id=${id} not found`);
    }
    return reason;
  }

  async create(organizationId: string, dto: CreateLostReasonDto) {
    const existing = await this.prisma.lostReason.findFirst({
      where: { reason: dto.reason, organizationId },
    });
    if (existing) {
      throw new ConflictException(
        `Lost reason "${dto.reason}" already exists in this organization`,
      );
    }
    return this.prisma.lostReason.create({
      data: {
        organizationId,
        reason: dto.reason,
        description: dto.description,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateLostReasonDto) {
    await this.getById(id, organizationId);
    if (dto.reason) {
      const conflict = await this.prisma.lostReason.findFirst({
        where: { reason: dto.reason, organizationId, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Lost reason "${dto.reason}" already exists`);
      }
    }
    return this.prisma.lostReason.update({
      where: { id },
      data: {
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deactivate(id: string, organizationId: string) {
    return this.update(id, organizationId, { isActive: false });
  }

  async delete(id: string, organizationId: string) {
    await this.getById(id, organizationId);
    await this.prisma.lostReason.delete({ where: { id } });
  }
}
