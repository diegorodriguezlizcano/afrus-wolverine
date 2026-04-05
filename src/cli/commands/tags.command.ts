import { Command, CommandRunner, SubCommand, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { TagsService } from '../../tags/tags.service.js';

@SubCommand({ name: 'assign', description: 'Assign tags to a lead' })
@Injectable()
export class TagsAssignSubCommand extends CommandRunner {
  constructor(private readonly tagsService: TagsService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const [email, ...tags] = passedParams;
    const orgId = options?.org;
    if (!email || tags.length === 0 || !orgId) {
      console.error('Usage: wolverine tags assign <email> <tag1> <tag2> --org <orgId>');
      return;
    }
    try {
      const result = await this.tagsService.assignTags(email, tags, null, orgId, '');
      console.log(`✅ Assigned ${result.assignedTags.length} tag(s) to ${email}`);
      if (result.actionTagsTriggered.length > 0) {
        console.log(`⚡ ALMA triggered: ${result.actionTagsTriggered.join(', ')}`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message ?? err}`);
    }
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }
}

@SubCommand({ name: 'list', description: 'List tags for a lead' })
@Injectable()
export class TagsListSubCommand extends CommandRunner {
  constructor(private readonly tagsService: TagsService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const email = passedParams[0];
    const orgId = options?.org;
    if (!email || !orgId) {
      console.error('Usage: wolverine tags list <email> --org <orgId>');
      return;
    }
    const tags = await this.tagsService.getLeadTags(email, orgId);
    console.table(tags.map(t => ({ type: t.tagType, value: t.tagValue, assigned: t.createdAt.toISOString().split('T')[0] })));
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }
}

@Command({
  name: 'tags',
  description: 'Tag management commands',
  subCommands: [TagsAssignSubCommand, TagsListSubCommand],
})
@Injectable()
export class TagsCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log('Usage: wolverine tags <assign|list> [options]');
  }
}
