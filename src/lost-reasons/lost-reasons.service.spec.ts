import { Test, TestingModule } from '@nestjs/testing';
import { LostReasonsService } from './lost-reasons.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('LostReasonsService', () => {
  let service: LostReasonsService;
  let mockPrisma: any;

  const ORG_ID = 'org-123';

  beforeEach(async () => {
    mockPrisma = {
      lostReason: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LostReasonsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LostReasonsService>(LostReasonsService);
  });

  describe('list', () => {
    it('returns only active reasons by default', async () => {
      const reasons = [
        { id: '1', reason: 'no_budget', isActive: true, organizationId: ORG_ID },
      ];
      mockPrisma.lostReason.findMany.mockResolvedValue(reasons);

      const result = await service.list(ORG_ID);
      expect(result).toHaveLength(1);
      expect(mockPrisma.lostReason.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('includes inactive reasons when includeInactive=true', async () => {
      mockPrisma.lostReason.findMany.mockResolvedValue([]);
      await service.list(ORG_ID, true);
      expect(mockPrisma.lostReason.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('creates a reason when reason is unique', async () => {
      mockPrisma.lostReason.findFirst.mockResolvedValue(null);
      const created = { id: 'new', reason: 'no_budget', organizationId: ORG_ID };
      mockPrisma.lostReason.create.mockResolvedValue(created);

      const result = await service.create(ORG_ID, { reason: 'no_budget' });
      expect(result.reason).toBe('no_budget');
    });

    it('throws ConflictException when reason exists', async () => {
      mockPrisma.lostReason.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create(ORG_ID, { reason: 'no_budget' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates fields when provided', async () => {
      // First findFirst: getById check
      mockPrisma.lostReason.findFirst.mockResolvedValueOnce({ id: 'lr-1', reason: 'old' });
      // Second findFirst: conflict check (null = no conflict)
      mockPrisma.lostReason.findFirst.mockResolvedValueOnce(null);
      const updated = { id: 'lr-1', reason: 'new_reason', isActive: false };
      mockPrisma.lostReason.update.mockResolvedValue(updated);

      const result = await service.update('lr-1', ORG_ID, { reason: 'new_reason', isActive: false });
      expect(result.reason).toBe('new_reason');
      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes the reason', async () => {
      mockPrisma.lostReason.findFirst.mockResolvedValue({ id: 'lr-1' });
      mockPrisma.lostReason.delete.mockResolvedValue({ id: 'lr-1' });

      await expect(service.delete('lr-1', ORG_ID)).resolves.toBeUndefined();
    });

    it('throws NotFoundException if not found', async () => {
      mockPrisma.lostReason.findFirst.mockResolvedValue(null);
      await expect(service.delete('non-existent', ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      mockPrisma.lostReason.findFirst.mockResolvedValue({ id: 'lr-1' });
      mockPrisma.lostReason.update.mockResolvedValue({ id: 'lr-1', isActive: false });

      const result = await service.deactivate('lr-1', ORG_ID);
      expect(result.isActive).toBe(false);
    });
  });
});
