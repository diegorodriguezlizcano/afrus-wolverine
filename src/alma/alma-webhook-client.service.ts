import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AlmaWebhookPayload {
  event: 'action_tag_assigned';
  actionTag: string;
  actionTagFull: string;
  lead: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    title: string | null;
    contactRole: string | null;
    stage: string;
    temperature: string;
    campaignName: string | null;
    utmCampaign: string | null;
    url: string | null;
  };
  organization: {
    orgId: string;
    name: string;
    domain: string | null;
    isCustomer: boolean;
  };
  context: {
    assignedBy: string | null;
    assignedAt: string;
    allTags: string[];
  };
  wolverine: {
    version: string;
    instanceId: string;
  };
}

export interface AlmaWebhookResponse {
  status: 'received' | 'error';
  callbackId?: string;
  message?: string;
}

/**
 * @deprecated ALMA communication is handled by afrus directly.
 * This service is only used when ALMA_ENABLED=true env var is set.
 * Do not use directly — use TagsService.assignTags() instead.
 */
@Injectable()
export class AlmaWebhookClientService {
  private readonly logger = new Logger(AlmaWebhookClientService.name);
  private readonly webhookUrl: string;
  /**
   * Number of retry attempts after the initial attempt.
   * Default: 3 → 1 initial + 3 retries = 4 total attempts.
   */
  private readonly maxRetries: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.webhookUrl = this.configService.get<string>(
      'ALMA_WEBHOOK_URL',
      'https://backend.afrus.app/api/v1/alma/webhook',
    );
    // Up to 2 retries after the initial attempt = 3 total attempts.
    // Adjust via constructor argument or env var if needed.
    this.maxRetries = 2;
  }

  /**
   * Posts an ALMA webhook payload with exponential-backoff retry.
   *
   * Retry policy:
   * - Retries on: network errors, 5xx HTTP errors
   * - Does NOT retry on: 4xx client errors (thrown immediately)
   * - Exponential backoff: 1s, 2s, 4s between retries
   * - Total attempts: 1 initial + maxRetries
   */
  async trigger(
    payload: AlmaWebhookPayload,
    orgApiKey: string,
  ): Promise<AlmaWebhookResponse & { callbackId?: string }> {
    const totalAttempts = 1 + this.maxRetries; // e.g. 4 = 1 initial + 3 retries
    let lastError: unknown;

    // ── Initial attempt (attempt = 0) ─────────────────────────────────────
    {
      const result = await this.attemptRequest(payload, orgApiKey, 1, totalAttempts);
      if (result.ok) return result.data;
      lastError = result.error;

      // 4xx errors are non-retryable — throw immediately
      if (result.isClientError) throw lastError;
    }

    // ── Retry loop (attempts 2 through totalAttempts) ─────────────────────
    for (let attempt = 2; attempt <= totalAttempts; attempt++) {
      const backoffMs = Math.pow(2, attempt - 2) * 1000; // 1s, 2s, 4s
      this.logger.debug(
        `[Attempt ${attempt}/${totalAttempts}] Waiting ${backoffMs}ms before retry...`,
      );
      await this.sleep(backoffMs);

      const result = await this.attemptRequest(payload, orgApiKey, attempt, totalAttempts);
      if (result.ok) return result.data;
      lastError = result.error;

      if (result.isClientError) throw lastError;
    }

    this.logger.error(
      `ALMA webhook exhausted all ${this.maxRetries} retries (${totalAttempts} total attempts) for actionTag=${payload.actionTag}`,
    );
    throw lastError ?? new InternalServerErrorException('ALMA webhook failed after all retries');
  }

  /**
   * Makes a single HTTP POST attempt to the ALMA webhook endpoint.
   * Returns a result discriminated union instead of throwing.
   */
  private async attemptRequest(
    payload: AlmaWebhookPayload,
    orgApiKey: string,
    attempt: number,
    totalAttempts: number,
  ): Promise<
    | { ok: true; data: AlmaWebhookResponse & { callbackId?: string } }
    | { ok: false; error: unknown; isClientError?: boolean; data?: undefined }
  > {
    try {
      this.logger.debug(
        `[Attempt ${attempt}/${totalAttempts}] Posting ALMA webhook for actionTag=${payload.actionTag}`,
      );

      const response = await firstValueFrom(
        this.httpService.post<AlmaWebhookResponse>(
          this.webhookUrl,
          payload,
          {
            headers: {
              Authorization: `Bearer ${orgApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10_000,
          },
        ),
      );

      this.logger.log(
        `ALMA webhook success: actionTag=${payload.actionTag}, callbackId=${response.data.callbackId ?? 'N/A'}`,
      );

      return {
        ok: true,
        data: {
          status: response.data.status,
          callbackId: response.data.callbackId,
          message: response.data.message,
        },
      };
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number };
        message?: string;
        code?: string;
      };

      // 4xx — do not retry
      if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
        this.logger.warn(
          `ALMA webhook 4xx error on attempt ${attempt}: ${error.response.status} — not retrying`,
        );
        return { ok: false, error: err, isClientError: true };
      }

      this.logger.warn(
        `ALMA webhook attempt ${attempt}/${totalAttempts} failed: ${error.message ?? error.code ?? 'unknown'}`,
      );

      return { ok: false, error: err };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
