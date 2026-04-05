import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Guard that extracts `X-API-Key` from request headers,
 * looks up the organization in the database, and attaches it to the request.
 *
 * Use with @UseGuards(OrganizationGuard) on any controller or route.
 * The resolved organization is available as `request['organization']`.
 *
 * IMPORTANT: This guard requires PrismaModule to be imported in the same module.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const org = await this.prisma.organization.findFirst({
      where: { afrusApiKey: apiKey },
    });

    if (!org) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach the resolved org to the request for downstream use
    request['organization'] = org;
    return true;
  }
}
