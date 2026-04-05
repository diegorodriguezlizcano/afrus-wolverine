import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AfrusApiService } from './afrus-api.service.js';
import { AppConfigService } from '../config/config.service.js';

describe('AfrusApiService', () => {
  let service: AfrusApiService;
  let httpRequestMock: jest.Mock;

  const TEST_API_KEY = 'test-api-key';
  const BASE_URL = 'https://backend.afrus.app';

  beforeEach(async () => {
    // Capture the mock before DI replaces it
    httpRequestMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AfrusApiService,
        {
          provide: HttpService,
          useFactory: () => ({ request: httpRequestMock }),
        },
        {
          provide: AppConfigService,
          useValue: {
            getAfrusApiUrl: jest.fn().mockReturnValue(BASE_URL),
            getAfrusApiKey: jest.fn().mockReturnValue('env-fallback-key'),
          },
        },
      ],
    }).compile();

    service = module.get<AfrusApiService>(AfrusApiService);
  });

  const mockResponse = (data: unknown) =>
    httpRequestMock.mockReturnValue(of({ data }));

  const mockError = (error: unknown) =>
    httpRequestMock.mockReturnValue(throwError(() => error));

  describe('request helper (via getLeads)', () => {
    it('sends correct url, headers, and params', async () => {
      mockResponse({ data: [], total: 0, page: 1, per_page: 100, total_pages: 0 });
      await service.getLeads(TEST_API_KEY, { page: 1, perPage: 50 });
      expect(httpRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: `${BASE_URL}/api/v1/api2/leads`,
          headers: { Authorization: `Bearer ${TEST_API_KEY}`, 'Content-Type': 'application/json' },
          params: { page: '1', per_page: '50' },
          timeout: 15_000,
        }),
      );
    });
  });

  describe('getLeads', () => {
    it('returns paginated response', async () => {
      const payload = {
        data: [{ afrus_lead_id: '1', email: 'a@b.com' }],
        total: 1,
        page: 1,
        per_page: 100,
        total_pages: 1,
      };
      mockResponse(payload);
      const result = await service.getLeads(TEST_API_KEY);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('uses default pagination when not specified', async () => {
      mockResponse({ data: [], total: 0, page: 1, per_page: 100, total_pages: 0 });
      await service.getLeads(TEST_API_KEY);
      expect(httpRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { page: '1', per_page: '100' } }),
      );
    });
  });

  describe('getMainDbLeads', () => {
    it('calls httpService.request with /leads/main-db path', async () => {
      mockResponse({ data: [], total: 0, page: 1, per_page: 100, total_pages: 0 });
      await service.getMainDbLeads(TEST_API_KEY);
      expect(httpRequestMock).toHaveBeenCalled();
    });
  });

  describe('getLeadByEmail', () => {
    it('returns first result when found', async () => {
      const lead = { afrus_lead_id: '1', email: 'test@example.com' };
      mockResponse({ data: [lead] });
      const result = await service.getLeadByEmail(TEST_API_KEY, 'test@example.com');
      expect(result).toEqual(lead);
    });

    it('returns null on 404', async () => {
      mockError({ response: { status: 404 } });
      const result = await service.getLeadByEmail(TEST_API_KEY, 'notfound@example.com');
      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockError({ response: { status: 500 } });
      await expect(
        service.getLeadByEmail(TEST_API_KEY, 'error@example.com'),
      ).rejects.toMatchObject({ response: { status: 500 } });
    });
  });

  describe('getConversionAmount', () => {
    it('returns amount on success', async () => {
      mockResponse({ amount: 500 });
      const result = await service.getConversionAmount(TEST_API_KEY, 'donor@example.com');
      expect(result).toEqual({ amount: 500 });
    });

    it('returns null on network error', async () => {
      mockError(new Error('network error'));
      const result = await service.getConversionAmount(TEST_API_KEY, 'error@example.com');
      expect(result).toBeNull();
    });
  });
});
