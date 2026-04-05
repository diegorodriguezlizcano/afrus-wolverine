import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class AlmaWebhookClientService {
  private readonly logger = new Logger(AlmaWebhookClientService.name);
  private readonly webhookUrl: string;
  private readonly maxRetries = 3; // up to 3 retries after initial attempt = 4 total

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.webhookUrl = this.configService.get<string>(
      'ALMA_WEBHOOK_URL',
      'https://backend.afrus.app/api/v1/alma/webhook',
    );
  }

  async trigger(
    payload: AlmaWebhookPayload,
    orgApiKey: string,
  ): Promise<AlmaWebhookResponse & { callbackId?: string }> {
    let lastError: unknown;

    const totalAttempts = 1 + this.maxRetries; // initial + retries
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
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
              timeout: 10000,
            },
          ),
        );

        this.logger.log(
          `ALMA webhook success: actionTag=${payload.actionTag}, callbackId=${response.data.callbackId ?? 'N/A'}`,
        );

        return {
          status: response.data.status,
          callbackId: response.data.callbackId,
          message: response.data.message,
        };
      } catch (err: unknown) {
        lastError = err;
        const error = err as { response?: { status?: number }; message?: string; code?: string };

        // 4xx errors — do not retry
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          this.logger.warn(
            `ALMA webhook 4xx error on attempt ${attempt}: ${error.response.status} — not retrying`,
          );
          throw err;
        }

        this.logger.warn(
          `ALMA webhook attempt ${attempt}/${totalAttempts} failed: ${error.message ?? error.code ?? 'unknown'}`,
        );

        if (attempt < totalAttempts) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          this.logger.debug(`Waiting ${backoffMs}ms before retry...`);
          await this.sleep(backoffMs);
        }
      }
    }

    this.logger.error(
      `ALMA webhook exhausted all ${this.maxRetries} retries (${totalAttempts} total attempts) for actionTag=${payload.actionTag}`,
    );
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
