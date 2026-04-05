import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlmaWebhookClientService, AlmaWebhookPayload, AlmaWebhookResponse } from './alma-webhook-client.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('AlmaWebhookClient', () => {
  let service: AlmaWebhookClientService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHttpService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockConfigService: any;

  const mockPayload: AlmaWebhookPayload = {
    event: 'action_tag_assigned',
    actionTag: 'meeting_scheduled',
    actionTagFull: 'action:meeting_scheduled',
    lead: {
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: null,
      title: null,
      contactRole: null,
      stage: 'NEW',
      temperature: 'COLD',
      campaignName: null,
      utmCampaign: null,
      url: null,
    },
    organization: {
      orgId: 'org-1',
      name: 'Test Org',
      domain: null,
      isCustomer: false,
    },
    context: {
      assignedBy: null,
      assignedAt: '2026-04-04T00:00:00.000Z',
      allTags: ['action:meeting_scheduled'],
    },
    wolverine: {
      version: '0.1.0',
      instanceId: 'test',
    },
  };

  const mockSuccessResponse: AxiosResponse<AlmaWebhookResponse> = {
    data: { status: 'received', callbackId: 'cb_abc123' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as any,
  };

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn().mockReturnValue(of(mockSuccessResponse)),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('https://backend.afrus.app/api/v1/alma/webhook'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlmaWebhookClientService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AlmaWebhookClientService>(AlmaWebhookClientService);
  });

  // -------------------------------------------------------------------------
  // trigger tests
  // -------------------------------------------------------------------------

  describe('trigger', () => {
    it('should POST to correct endpoint with Bearer token', async () => {
      await service.trigger(mockPayload, 'test-api-key');

      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
      const [url, payload, options] = mockHttpService.post.mock.calls[0];
      expect(url).toBe('https://backend.afrus.app/api/v1/alma/webhook');
      expect(payload).toEqual(mockPayload);
      expect(options.headers.Authorization).toBe('Bearer test-api-key');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should include all required fields in payload', async () => {
      await service.trigger(mockPayload, 'test-api-key');

      const [, payload] = mockHttpService.post.mock.calls[0];
      expect(payload.event).toBe('action_tag_assigned');
      expect(payload.actionTag).toBe('meeting_scheduled');
      expect(payload.lead.email).toBe('john@example.com');
      expect(payload.organization.orgId).toBe('org-1');
      expect(payload.context.allTags).toContain('action:meeting_scheduled');
      expect(payload.wolverine.version).toBeDefined();
    });

    it('should return callbackId on success', async () => {
      const result = await service.trigger(mockPayload, 'test-api-key');
      expect(result.callbackId).toBe('cb_abc123');
      expect(result.status).toBe('received');
    });
  });

  // -------------------------------------------------------------------------
  // retry logic tests
  // -------------------------------------------------------------------------

  describe('retry logic', () => {
    it('should retry on 5xx errors', async () => {
      const serverError = { response: { status: 503 }, message: 'Service Unavailable', code: 'ERR_BAD_RESPONSE' };
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const result = await service.trigger(mockPayload, 'test-api-key');
      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('received');
    });

    it('should not retry on 4xx errors', async () => {
      const clientError = { response: { status: 400 }, message: 'Bad Request', code: 'ERR_BAD_REQUEST' };
      mockHttpService.post.mockReturnValueOnce(throwError(() => clientError));

      await expect(service.trigger(mockPayload, 'test-api-key')).rejects.toMatchObject({
        response: { status: 400 },
      });
      // Only 1 call — no retries for 4xx
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const serverError = { response: { status: 500 }, message: 'Internal Error', code: 'ERR_BAD_RESPONSE' };
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const start = Date.now();
      await service.trigger(mockPayload, 'test-api-key');
      const elapsed = Date.now() - start;

      // 2 retries × exponential backoff (1s first, 2s second) = ~3s minimum
      expect(elapsed).toBeGreaterThanOrEqual(2900);
    });

    it('should give up after 3 retries (4 total attempts)', async () => {
      // Mock sleep to avoid real delays
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const serverError = { response: { status: 500 }, message: 'Internal Error', code: 'ERR_BAD_RESPONSE' };
      mockHttpService.post.mockReturnValue(throwError(() => serverError));

      await expect(service.trigger(mockPayload, 'test-api-key')).rejects.toBeDefined();
      // 1 initial attempt + 3 retries = 4 total calls
      expect(mockHttpService.post).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------------------------------------
  // error handling tests
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw on network failure after all retries', async () => {
      // Mock sleep to avoid real delays
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const networkError = { message: 'ECONNREFUSED', code: 'ECONNREFUSED' };
      mockHttpService.post.mockReturnValue(throwError(() => networkError));

      await expect(service.trigger(mockPayload, 'test-api-key')).rejects.toMatchObject({
        message: 'ECONNREFUSED',
      });
    });

    it('should log all retry attempts', async () => {
      const serverError = { response: { status: 500 }, message: 'Internal Error', code: 'ERR_BAD_RESPONSE' };
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
      await service.trigger(mockPayload, 'test-api-key');

      // Should have logged at least the first failure
      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
