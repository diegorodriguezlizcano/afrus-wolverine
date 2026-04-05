import { Test, TestingModule } from '@nestjs/testing';
import { TagsService, ParsedTag } from './tags.service';
import { AlmaWebhookClientService } from '../alma/alma-webhook-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagType } from './tag-type.enum';
import { BadRequestException } from '@nestjs/common';

describe('TagsService', () => {
  let service: TagsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAlmaClient: any;

  beforeEach(async () => {
    mockPrisma = {
      tag: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      lead: {
        findFirst: jest.fn(),
      },
      actionTagLog: {
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    mockAlmaClient = {
      trigger: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlmaWebhookClientService, useValue: mockAlmaClient },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  // -------------------------------------------------------------------------
  // parseTags tests
  // -------------------------------------------------------------------------

  describe('parseTags', () => {
    it('should parse valid stage, action, and temp tags', () => {
      const tags = ['stage:scheduled', 'action:meeting_scheduled', 'temp:warm'];
      const result = service.parseTags(tags);
      expect(result).toEqual([
        { type: TagType.STAGE, value: 'scheduled' },
        { type: TagType.ACTION, value: 'meeting_scheduled' },
        { type: TagType.TEMP, value: 'warm' },
      ]);
    });

    it('should parse tag strings into type+value objects', () => {
      const tags = ['origin:linkedin', 'sync:fundraiser'];
      const result = service.parseTags(tags);
      expect(result[0].type).toBe(TagType.ORIGIN);
      expect(result[0].value).toBe('linkedin');
      expect(result[1].type).toBe(TagType.SYNC);
      expect(result[1].value).toBe('fundraiser');
    });

    it('should reject duplicate tag types in same request', () => {
      expect(() => service.parseTags(['stage:scheduled', 'stage:qualified'])).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid tag format — missing colon', () => {
      expect(() => service.parseTags(['stage_scheduled'])).toThrow(BadRequestException);
    });

    it('should reject invalid tag format — empty type', () => {
      expect(() => service.parseTags([':value'])).toThrow(BadRequestException);
    });

    it('should reject invalid tag format — empty value', () => {
      expect(() => service.parseTags(['stage:'])).toThrow(BadRequestException);
    });

    it('should reject unknown tag type', () => {
      expect(() => service.parseTags(['unknown:value'])).toThrow(BadRequestException);
    });

    it('should reject empty tags array', () => {
      expect(() => service.parseTags([])).toThrow(BadRequestException);
    });

    it('should reject null/undefined items in array', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => service.parseTags([null as any])).toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // detectActionTags tests
  // -------------------------------------------------------------------------

  describe('detectActionTags', () => {
    it('should return empty array when no action tags present', () => {
      const parsed: ParsedTag[] = [
        { type: TagType.STAGE, value: 'scheduled' },
        { type: TagType.TEMP, value: 'warm' },
      ];
      expect(service.detectActionTags(parsed)).toEqual([]);
    });

    it('should return action tag values when present', () => {
      const parsed: ParsedTag[] = [
        { type: TagType.STAGE, value: 'scheduled' },
        { type: TagType.ACTION, value: 'meeting_scheduled' },
        { type: TagType.ACTION, value: 'post_meeting_followup' },
      ];
      expect(service.detectActionTags(parsed)).toEqual([
        'meeting_scheduled',
        'post_meeting_followup',
      ]);
    });

    it('should strip action: prefix from tag values', () => {
      // The detect method operates on already-parsed values (prefix stripped during parseTags).
      const parsed: ParsedTag[] = [{ type: TagType.ACTION, value: 'meeting_scheduled' }];
      const result = service.detectActionTags(parsed);
      expect(result[0]).toBe('meeting_scheduled');
      expect(result[0]).not.toContain('action:');
    });

    it('should return empty array for empty input', () => {
      expect(service.detectActionTags([])).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getLeadTags tests
  // -------------------------------------------------------------------------

  describe('getLeadTags', () => {
    it('should return all tags for a lead', async () => {
      const mockTags = [
        { id: '1', organizationId: 'org1', leadEmail: 'test@example.com', tagType: TagType.STAGE, tagValue: 'scheduled', createdAt: new Date(), updatedAt: new Date() },
        { id: '2', organizationId: 'org1', leadEmail: 'test@example.com', tagType: TagType.TEMP, tagValue: 'warm', createdAt: new Date(), updatedAt: new Date() },
      ];
      mockPrisma.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getLeadTags('test@example.com', 'org1');
      expect(result).toHaveLength(2);
      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { leadEmail: 'test@example.com', organizationId: 'org1' },
      });
    });

    it('should return empty array for lead with no tags', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([]);
      const result = await service.getLeadTags('new@example.com', 'org1');
      expect(result).toEqual([]);
    });
  });
});
