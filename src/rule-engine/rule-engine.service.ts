import { Injectable } from '@nestjs/common';
import { RuleEngine, TransitionContext } from './rule-engine.js';
import { PipelineStage } from '@prisma/client';

@Injectable()
export class RuleEngineService {
  /**
   * Evaluates all preconditions for a proposed transition.
   * Does NOT throw — returns errors in the result object.
   */
  evaluate(ctx: TransitionContext, toStage: PipelineStage, lostReasonId?: string) {
    return RuleEngine.evaluate(ctx, toStage, lostReasonId);
  }

  /**
   * Strict evaluation — throws BadRequestException if validation fails.
   */
  evaluateOrThrow(ctx: TransitionContext, toStage: PipelineStage, lostReasonId?: string) {
    return RuleEngine.evaluateOrThrow(ctx, toStage, lostReasonId);
  }

  /**
   * Returns all registered transition rules.
   */
  getRules() {
    return RuleEngine.getRules();
  }
}
