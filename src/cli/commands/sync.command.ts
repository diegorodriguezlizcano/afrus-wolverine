import { Command, CommandRunner, SubCommand, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ExtractionPipelineService } from '../../extraction/extraction-pipeline.service.js';
import { SyncOrchestratorService } from '../../sync/sync-orchestrator.service.js';

@SubCommand({ name: 'extract', description: 'Run extraction for a sync tag' })
@Injectable()
export class SyncExtractSubCommand extends CommandRunner {
  constructor(private readonly extraction: ExtractionPipelineService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const syncTag = passedParams[0];
    const orgId = options?.org;
    if (!syncTag || !orgId) {
      console.error('Usage: wolverine sync extract <sync_tag> --org <orgId>');
      return;
    }
    try {
      console.log(`⏳ Extracting leads for sync tag "${syncTag}"...`);
      const result = await this.extraction.runExtraction(orgId, syncTag);
      console.log(`✅ Extraction complete: ${result.createdCount} created, ${result.updatedCount} updated, ${result.errorCount} errors`);
    } catch (err: any) {
      console.error(`❌ ${err.message ?? err}`);
    }
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }
}

@SubCommand({ name: 'status', description: 'Show sync status for an organization' })
@Injectable()
export class SyncStatusSubCommand extends CommandRunner {
  constructor(private readonly syncOrchestrator: SyncOrchestratorService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const orgId = options?.org ?? passedParams[0];
    if (!orgId) {
      console.error('Usage: wolverine sync status --org <orgId>');
      return;
    }
    const stats = await this.syncOrchestrator.getSyncStats(orgId);
    console.log(`Sync Status for org=${orgId}:`);
    console.log(`  Total syncs: ${stats.total}`);
    console.log(`  Synced: ${stats.synced}`);
    console.log(`  Failed: ${stats.failed}`);
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }
}

@Command({
  name: 'sync',
  description: 'Sync and extraction commands',
  subCommands: [SyncExtractSubCommand, SyncStatusSubCommand],
})
@Injectable()
export class SyncCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log('Usage: wolverine sync <extract|status> [options]');
  }
}
