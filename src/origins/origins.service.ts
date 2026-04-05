import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOriginDto, UpdateOriginDto } from './dto/create-origin.dto.js';

@Injectable()
export class OriginsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.origin.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getById(id: string, organizationId: string) {
    const origin = await this.prisma.origin.findFirst({
      where: { id, organizationId },
    });
    if (!origin) {
      throw new NotFoundException(`Origin with id=${id} not found`);
    }
    return origin;
  }

  async create(organizationId: string, dto: CreateOriginDto) {
    const existing = await this.prisma.origin.findFirst({
      where: { name: dto.name, organizationId },
    });
    if (existing) {
      throw new ConflictException(
        `Origin "${dto.name}" already exists in this organization`,
      );
    }
    return this.prisma.origin.create({
      data: { organizationId, name: dto.name, description: dto.description },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateOriginDto) {
    await this.getById(id, organizationId);
    if (dto.name) {
      const conflict = await this.prisma.origin.findFirst({
        where: { name: dto.name, organizationId, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Origin "${dto.name}" already exists`);
      }
    }
    return this.prisma.origin.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async delete(id: string, organizationId: string) {
    await this.getById(id, organizationId);
    await this.prisma.origin.delete({ where: { id } });
  }
}
