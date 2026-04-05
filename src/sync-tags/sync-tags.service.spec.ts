import { Test, TestingModule } from '@nestjs/testing';
import { SyncTagsService } from './sync-tags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('SyncTagsService', () => {
  let service: SyncTagsService;
  let mockPrisma: any;

  const ORG_ID = 'org-123';

  beforeEach(async () => {
    mockPrisma = {
      syncTag: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncTagsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SyncTagsService>(SyncTagsService);
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all sync tags for the org', async () => {
      const tags = [
        { id: '1', tagValue: 'leads-a', afrusTagName: 'Leads A', organizationId: ORG_ID },
        { id: '2', tagValue: 'leads-b', afrusTagName: 'Leads B', organizationId: ORG_ID },
      ];
      mockPrisma.syncTag.findMany.mockResolvedValue(tags);

      const result = await service.list(ORG_ID);
      expect(result).toHaveLength(2);
      expect(mockPrisma.syncTag.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ─── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the sync tag if found', async () => {
      const tag = { id: 'sync-1', tagValue: 'hot', afrusTagName: 'Hot', organizationId: ORG_ID };
      mockPrisma.syncTag.findFirst.mockResolvedValue(tag);

      const result = await service.getById('sync-1', ORG_ID);
      expect(result).toEqual(tag);
    });

    it('throws NotFoundException if not found', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue(null);
      await expect(service.getById('non-existent', ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a sync tag when tagValue is unique', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue(null);
      const created = { id: 'new', tagValue: 'new-tag', afrusTagName: 'New Tag', organizationId: ORG_ID };
      mockPrisma.syncTag.create.mockResolvedValue(created);

      const result = await service.create(ORG_ID, {
        tagValue: 'new-tag',
        afrusTagName: 'New Tag',
      });
      expect(result).toEqual(created);
    });

    it('throws ConflictException if tagValue already exists', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(ORG_ID, { tagValue: 'dup', afrusTagName: 'Dup' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fields when provided', async () => {
      const existing = { id: 'sync-1', tagValue: 'old', afrusTagName: 'Old', organizationId: ORG_ID };
      // First findFirst: getById check
      mockPrisma.syncTag.findFirst.mockResolvedValueOnce(existing);
      // Second findFirst: tagValue conflict check (null = no conflict)
      mockPrisma.syncTag.findFirst.mockResolvedValueOnce(null);
      const updated = { ...existing, tagValue: 'new-name' };
      mockPrisma.syncTag.update.mockResolvedValue(updated);

      const result = await service.update('sync-1', ORG_ID, { tagValue: 'new-name' });
      expect(result.tagValue).toBe('new-name');
    });

    it('throws ConflictException when renaming to an existing tagValue', async () => {
      mockPrisma.syncTag.findFirst
        .mockResolvedValueOnce({ id: 'sync-1', tagValue: 'old' })
        .mockResolvedValueOnce({ id: 'other', tagValue: 'existing' });

      await expect(
        service.update('sync-1', ORG_ID, { tagValue: 'existing' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes the sync tag', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue({ id: 'sync-1' });
      mockPrisma.syncTag.delete.mockResolvedValue({ id: 'sync-1' });

      await expect(service.delete('sync-1', ORG_ID)).resolves.toBeUndefined();
      expect(mockPrisma.syncTag.delete).toHaveBeenCalledWith({ where: { id: 'sync-1' } });
    });

    it('throws NotFoundException if tag not found', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue(null);
      await expect(service.delete('non-existent', ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      mockPrisma.syncTag.findFirst.mockResolvedValue({ id: 'sync-1' });
      mockPrisma.syncTag.update.mockResolvedValue({ id: 'sync-1', isActive: false });

      const result = await service.deactivate('sync-1', ORG_ID);
      expect(result.isActive).toBe(false);
    });
  });
});
