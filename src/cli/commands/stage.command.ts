import { Command, CommandRunner, SubCommand, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PipelineStage } from '@prisma/client';

@SubCommand({ name: 'transition', description: 'Transition a lead to a new stage' })
@Injectable()
export class StageTransitionSubCommand extends CommandRunner {
  constructor(private readonly pipelineService: PipelineService) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const [email, newStage] = passedParams;
    if (!email || !newStage) {
      console.error('Usage: wolverine stage transition <email> <new_stage> [--user <userId>] [--reason <lostReasonId>]');
      return;
    }
    const userId = options?.user ?? 'cli-user';
    const lostReasonId = options?.reason;

    try {
      const result = await this.pipelineService.transition(
        email,
        newStage.toUpperCase() as PipelineStage,
        userId,
        { lostReasonId },
      );
      console.log(`✅ ${result.fromStage} → ${result.toStage} (log: ${result.transitionLogId})`);
    } catch (err: any) {
      console.error(`❌ ${err.message ?? err}`);
    }
  }

  @Option({ flags: '-u, --user <userId>', description: 'User ID triggering the transition' })
  parseUser(val: string) { return val; }

  @Option({ flags: '-r, --reason <reasonId>', description: 'Lost reason ID (required for → LOST)' })
  parseReason(val: string) { return val; }
}

@Command({
  name: 'stage',
  description: 'Pipeline stage commands',
  subCommands: [StageTransitionSubCommand],
})
@Injectable()
export class StageCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log('Usage: wolverine stage <transition> [options]');
  }
}
