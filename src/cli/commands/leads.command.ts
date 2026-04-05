import { Command, CommandRunner, SubCommand, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@SubCommand({ name: 'list', description: 'List leads for an organization' })
@Injectable()
export class LeadsListSubCommand extends CommandRunner {
  constructor(private readonly prisma: PrismaService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const orgId = options?.org ?? passedParams[0];
    if (!orgId) {
      console.error('Usage: wolverine leads list --org <org-id>');
      return;
    }
    const leads = await this.prisma.lead.findMany({
      where: { organizationId: orgId },
      select: { email: true, firstName: true, lastName: true, stage: true, temperature: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    console.table(leads.map(l => ({
      email: l.email,
      name: `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim(),
      stage: l.stage,
      temp: l.temperature,
      updated: l.updatedAt.toISOString().split('T')[0],
    })));
    console.log(`\n${leads.length} lead(s) shown.`);
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }
}

@SubCommand({ name: 'show', description: 'Show lead details' })
@Injectable()
export class LeadsShowSubCommand extends CommandRunner {
  constructor(private readonly prisma: PrismaService) { super(); }

  async run(passedParams: string[]): Promise<void> {
    const email = passedParams[0];
    if (!email) {
      console.error('Usage: wolverine leads show <email>');
      return;
    }
    const lead = await this.prisma.lead.findFirst({
      where: { email },
      include: { tags: true, stageTransitions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!lead) {
      console.error(`Lead "${email}" not found.`);
      return;
    }
    console.log(JSON.stringify(lead, null, 2));
  }
}

@Command({
  name: 'leads',
  description: 'Lead management commands',
  subCommands: [LeadsListSubCommand, LeadsShowSubCommand],
})
@Injectable()
export class LeadsCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log('Usage: wolverine leads <list|show> [options]');
  }
}
