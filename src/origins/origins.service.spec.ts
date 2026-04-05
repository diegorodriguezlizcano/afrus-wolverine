import { Test, TestingModule } from '@nestjs/testing';
import { OriginsService } from './origins.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('OriginsService', () => {
  let service: OriginsService;
  let mockPrisma: any;

  const ORG_ID = 'org-123';

  beforeEach(async () => {
    mockPrisma = {
      origin: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OriginsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OriginsService>(OriginsService);
  });

  describe('list', () => {
    it('returns origins sorted by createdAt', async () => {
      const origins = [
        { id: '1', name: 'linkedin', organizationId: ORG_ID },
        { id: '2', name: 'website', organizationId: ORG_ID },
      ];
      mockPrisma.origin.findMany.mockResolvedValue(origins);

      const result = await service.list(ORG_ID);
      expect(result).toHaveLength(2);
      expect(mockPrisma.origin.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('creates origin when name is unique', async () => {
      mockPrisma.origin.findFirst.mockResolvedValue(null);
      const created = { id: 'new', name: 'linkedin', organizationId: ORG_ID };
      mockPrisma.origin.create.mockResolvedValue(created);

      const result = await service.create(ORG_ID, { name: 'linkedin' });
      expect(result.name).toBe('linkedin');
    });

    it('throws ConflictException when name exists', async () => {
      mockPrisma.origin.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create(ORG_ID, { name: 'linkedin' })).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('deletes the origin', async () => {
      mockPrisma.origin.findFirst.mockResolvedValue({ id: 'orig-1' });
      mockPrisma.origin.delete.mockResolvedValue({ id: 'orig-1' });

      await expect(service.delete('orig-1', ORG_ID)).resolves.toBeUndefined();
    });

    it('throws NotFoundException if not found', async () => {
      mockPrisma.origin.findFirst.mockResolvedValue(null);
      await expect(service.delete('non-existent', ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
