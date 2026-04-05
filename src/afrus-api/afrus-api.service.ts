import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service.js';

/**
 * Lead fields as returned by the afrus v2 API.
 */
export interface AfrusLead {
  afrus_lead_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  stage?: string;
  temperature?: string;
  campaign_name?: string;
  utm_campaign?: string;
  tags?: string[];
  assigned_sdr?: string;
  [key: string]: unknown;
}

export interface AfrusPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/**
 * afrus API Client — handles per-org authenticated calls to the afrus backend.
 *
 * Design:
 * - Per-org API keys stored in the database (Organization.afrusApiKey)
 * - Fallback to env AFRUS_API_KEY for initial setup
 * - All methods are async and return typed responses
 * - Errors from afrus are logged and rethrown with context
 */
@Injectable()
export class AfrusApiService {
  private readonly logger = new Logger(AfrusApiService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly httpService: HttpService,
  ) {}

  // ─── Generic request helper ─────────────────────────────────────────────

  private async request<T>(options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    apiKey: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  }): Promise<T> {
    const baseUrl = this.configService.getAfrusApiUrl();
    const url = `${baseUrl}/api/v1/api2${options.path}`;

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          method: options.method,
          url,
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          data: options.body,
          params: options.params,
          timeout: 15_000,
        }),
      );
      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
        code?: string;
      };
      this.logger.error(
        `afrus API error: ${options.method} ${options.path} → ${error.response?.status ?? error.code ?? 'unknown'}: ${JSON.stringify(error.response?.data ?? error.message)}`,
      );
      throw err;
    }
  }

  // ─── Leads ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads?page=1&per_page=100
   * Returns paginated list of leads.
   */
  async getLeads(
    apiKey: string,
    options: { page?: number; perPage?: number } = {},
  ): Promise<AfrusPaginatedResponse<AfrusLead>> {
    return this.request<AfrusPaginatedResponse<AfrusLead>>({
      method: 'GET',
      path: '/leads',
      apiKey,
      params: {
        page: String(options.page ?? 1),
        per_page: String(options.perPage ?? 100),
      },
    });
  }

  /**
   * GET /api/v1/api2/leads/main-db?page=1&per_page=100
   * Returns leads from the main database.
   */
  async getMainDbLeads(
    apiKey: string,
    options: { page?: number; perPage?: number } = {},
  ): Promise<AfrusPaginatedResponse<AfrusLead>> {
    return this.request<AfrusPaginatedResponse<AfrusLead>>({
      method: 'GET',
      path: '/leads/main-db',
      apiKey,
      params: {
        page: String(options.page ?? 1),
        per_page: String(options.perPage ?? 100),
      },
    });
  }

  /**
   * GET /api/v1/api2/leads?email=xxx
   * Returns a single lead by email.
   */
  async getLeadByEmail(apiKey: string, email: string): Promise<AfrusLead | null> {
    try {
      const response = await this.request<{ data: AfrusLead[] }>({
        method: 'GET',
        path: '/leads',
        apiKey,
        params: { email },
      });
      return response.data[0] ?? null;
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * POST /api/v1/api2/leads
   * Creates a new lead.
   */
  async createLead(apiKey: string, lead: Partial<AfrusLead>): Promise<AfrusLead> {
    return this.request<AfrusLead>({
      method: 'POST',
      path: '/leads',
      apiKey,
      body: lead,
    });
  }

  /**
   * PUT /api/v1/api2/leads
   * Updates an existing lead.
   */
  async updateLead(apiKey: string, lead: Partial<AfrusLead>): Promise<AfrusLead> {
    return this.request<AfrusLead>({
      method: 'PUT',
      path: '/leads',
      apiKey,
      body: lead,
    });
  }

  /**
   * DELETE /api/v1/api2/leads?email=xxx
   */
  async deleteLead(apiKey: string, email: string): Promise<void> {
    await this.request<unknown>({
      method: 'DELETE',
      path: '/leads',
      apiKey,
      params: { email },
    });
  }

  // ─── Tags ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/tags?page=1&per_page=100
   * Returns all tags from afrus.
   */
  async getTags(
    apiKey: string,
    options: { page?: number; perPage?: number } = {},
  ) {
    return this.request<unknown>({
      method: 'GET',
      path: '/leads/tags',
      apiKey,
      params: {
        page: String(options.page ?? 1),
        per_page: String(options.perPage ?? 100),
      },
    });
  }

  // ─── Forms ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/forms
   */
  async getForms(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/leads/forms',
      apiKey,
    });
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/campaigns
   */
  async getCampaigns(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/leads/campaigns',
      apiKey,
    });
  }

  // ─── Email ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/api2/leads/send-email
   */
  async sendEmail(apiKey: string, payload: {
    email: string;
    subject: string;
    body: string;
    template_id?: string;
  }): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/leads/send-email',
      apiKey,
      body: payload,
    });
  }

  /**
   * POST /api/v1/api2/leads/send-rich-email
   */
  async sendRichEmail(apiKey: string, payload: {
    email: string;
    subject: string;
    body: string;
    template_id?: string;
  }): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/leads/send-rich-email',
      apiKey,
      body: payload,
    });
  }

  // ─── Communication Channels ─────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/communication-channels
   */
  async getCommunicationChannels(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/leads/communication-channels',
      apiKey,
    });
  }

  // ─── Lead ID from Email ────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/lead-id-from-email?email=xxx
   */
  async getLeadIdFromEmail(apiKey: string, email: string): Promise<{ id: string } | null> {
    try {
      return await this.request<{ id: string }>({
        method: 'GET',
        path: '/leads/lead-id-from-email',
        apiKey,
        params: { email },
      });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 404) return null;
      throw err;
    }
  }

  // ─── Conversion Amount ─────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/leads/conversion-amount?email=xxx
   */
  async getConversionAmount(apiKey: string, email: string): Promise<{ amount: number } | null> {
    try {
      return await this.request<{ amount: number }>({
        method: 'GET',
        path: '/leads/conversion-amount',
        apiKey,
        params: { email },
      });
    } catch {
      return null;
    }
  }

  // ─── Assign / Remove Tags ──────────────────────────────────────────────

  /**
   * POST /api/v1/api2/leads/assign-tags-remove-previous
   */
  async assignTagsRemovePrevious(
    apiKey: string,
    payload: { email: string; tags: string[] },
  ): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/leads/assign-tags-remove-previous',
      apiKey,
      body: payload,
    });
  }

  // ─── Organizations ────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/organizations
   */
  async getOrganizations(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/organizations',
      apiKey,
    });
  }

  // ─── Webhook ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/api2/organizations/webhook
   */
  async configureWebhook(apiKey: string, webhookUrl: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/organizations/webhook',
      apiKey,
      body: { url: webhookUrl },
    });
  }

  // ─── Email Senders ────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/organizations/email-senders
   */
  async getEmailSenders(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/organizations/email-senders',
      apiKey,
    });
  }

  // ─── Image Attributes ─────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/organizations/image-attributes
   */
  async getImageAttributes(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/organizations/image-attributes',
      apiKey,
    });
  }

  // ─── Users ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/api2/users
   */
  async getUsers(apiKey: string) {
    return this.request<unknown>({
      method: 'GET',
      path: '/users',
      apiKey,
    });
  }

  // ─── With Org Lookup ──────────────────────────────────────────────────

  /**
   * Resolves an organization to its API key and makes a GET request.
   */
  async getLeadsForOrg(organizationId: string): Promise<AfrusPaginatedResponse<AfrusLead>> {
    const apiKey = await this.getOrgApiKey(organizationId);
    return this.getLeads(apiKey);
  }

  /**
   * Gets the API key for an organization (DB lookup with env fallback).
   */
  async getOrgApiKey(organizationId: string): Promise<string> {
    // Dynamic import to avoid circular deps (PrismaService needs AppConfigModule)
    const { PrismaService } = await import('../prisma/prisma.service.js');
    const prisma = new PrismaService();

    try {
      const org = await prisma.organization.findFirst({
        where: { id: organizationId },
        select: { afrusApiKey: true },
      });

      if (org?.afrusApiKey) {
        await prisma.$disconnect();
        return org.afrusApiKey;
      }

      await prisma.$disconnect();
    } catch (err) {
      this.logger.warn(`Could not fetch org ${organizationId} from DB: ${err}`);
    }

    // Fallback to env
    const envKey = this.configService.getAfrusApiKey();
    if (!envKey) {
      throw new Error(
        `No afrus API key found for organization ${organizationId} and no env fallback configured`,
      );
    }
    return envKey;
  }
}
