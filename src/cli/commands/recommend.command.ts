import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { NextActionAgent } from '../../agents/next-action-agent.js';
import { LeadSummarizer } from '../../agents/lead-summarizer.js';
import { ConversationDraftAgent } from '../../agents/conversation-draft-agent.js';

@Command({
  name: 'recommend',
  description: 'Get next-action recommendation for a lead',
})
@Injectable()
export class RecommendCommand extends CommandRunner {
  constructor(
    private readonly nextAction: NextActionAgent,
    private readonly summarizer: LeadSummarizer,
    private readonly drafter: ConversationDraftAgent,
  ) { super(); }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const email = passedParams[0];
    const orgId = options?.org;
    if (!email || !orgId) {
      console.error('Usage: wolverine recommend <email> --org <orgId> [--summary] [--draft <channel>]');
      return;
    }

    try {
      // Next-action recommendation
      console.log(`🤖 Analyzing lead ${email}...`);
      const recommendation = await this.nextAction.recommend(email, orgId);
      console.log('\n📋 Recommendation:');
      console.log(`  Action: ${recommendation.actionType}`);
      console.log(`  Priority: ${recommendation.priority}`);
      console.log(`  Reason: ${recommendation.reason}`);
      if (recommendation.suggestedEmailSubject) {
        console.log(`  Email subject: ${recommendation.suggestedEmailSubject}`);
      }
      if (recommendation.talkTrack) {
        console.log(`  Talk track: ${recommendation.talkTrack}`);
      }
      if (recommendation.followUpDays) {
        console.log(`  Follow up in: ${recommendation.followUpDays} day(s)`);
      }

      // Optional: summary
      if (options?.summary) {
        console.log('\n📄 Lead Summary:');
        const summary = await this.summarizer.summarize(email, orgId);
        console.log(`  ${summary.headline}`);
        console.log(`  ${summary.situation}`);
        if (summary.keyInsights.length > 0) {
          console.log('  Key insights:');
          summary.keyInsights.forEach(i => console.log(`    - ${i}`));
        }
        if (summary.riskFactors.length > 0) {
          console.log('  Risks:');
          summary.riskFactors.forEach(r => console.log(`    ⚠️ ${r}`));
        }
      }

      // Optional: draft
      if (options?.draft) {
        console.log(`\n✉️ Draft (${options.draft}):`);
        const draft = await this.drafter.draft(email, orgId, {
          channel: options.draft,
          draftType: 'follow_up',
        });
        if (draft.subject) console.log(`  Subject: ${draft.subject}`);
        console.log(`  Body:\n${draft.body}`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message ?? err}`);
    }
  }

  @Option({ flags: '-o, --org <orgId>', description: 'Organization ID' })
  parseOrg(val: string) { return val; }

  @Option({ flags: '-s, --summary', description: 'Include lead summary' })
  parseSummary() { return true; }

  @Option({ flags: '-d, --draft <channel>', description: 'Generate draft (email|whatsapp|linkedin)' })
  parseDraft(val: string) { return val; }
}
