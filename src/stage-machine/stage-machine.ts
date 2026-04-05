import { BadRequestException } from '@nestjs/common';
import { PipelineStage } from '@prisma/client';

/**
 * Pipeline Stage State Machine
 *
 * Defines and enforces valid transitions between pipeline stages.
 * Every stage change in Wolverine must pass through this machine.
 *
 * Stage lifecycle:
 *   NEW → SCHEDULED → MET → QUALIFIED → PROPOSED → NEGOTIATING → WON
 *   ↑_______↓_________↓______↓__________↓___________↓___________↓
 *   LOST ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
 *   ↑                                                          ↓
 *   ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
 *                        FUTURE (reactivatable hold)
 *
 * WON and LOST are terminal — no transitions out.
 * FUTURE can only be reactivated via → SCHEDULED.
 */
export class StageMachine {
  /**
   * All valid transitions. Key = current stage, Value = allowed next stages.
   * Empty array = terminal state (WON, LOST).
   */
  private static readonly TRANSITIONS: Record<string, PipelineStage[]> = {
    [PipelineStage.NEW]: [
      PipelineStage.SCHEDULED,
      PipelineStage.MET,
      PipelineStage.QUALIFIED,
      PipelineStage.PROPOSED,
      PipelineStage.NEGOTIATING,
      PipelineStage.FUTURE,
      PipelineStage.WON,
      PipelineStage.LOST,
    ],
    [PipelineStage.SCHEDULED]: [
      PipelineStage.MET,
      PipelineStage.QUALIFIED,
      PipelineStage.FUTURE,
      PipelineStage.LOST,
      // Allow going back to NEW (reschedule meeting)
      PipelineStage.NEW,
    ],
    [PipelineStage.MET]: [
      PipelineStage.QUALIFIED,
      PipelineStage.PROPOSED,
      PipelineStage.NEGOTIATING,
      PipelineStage.FUTURE,
      PipelineStage.WON,
      PipelineStage.LOST,
      // Allow going back to SCHEDULED (follow-up meeting)
      PipelineStage.SCHEDULED,
    ],
    [PipelineStage.QUALIFIED]: [
      PipelineStage.PROPOSED,
      PipelineStage.NEGOTIATING,
      PipelineStage.FUTURE,
      PipelineStage.WON,
      PipelineStage.LOST,
      PipelineStage.SCHEDULED,
    ],
    [PipelineStage.PROPOSED]: [
      PipelineStage.NEGOTIATING,
      PipelineStage.FUTURE,
      PipelineStage.WON,
      PipelineStage.LOST,
      PipelineStage.QUALIFIED,
      PipelineStage.SCHEDULED,
    ],
    [PipelineStage.NEGOTIATING]: [
      PipelineStage.WON,
      PipelineStage.LOST,
      PipelineStage.PROPOSED,
      PipelineStage.SCHEDULED,
    ],
    [PipelineStage.FUTURE]: [
      PipelineStage.SCHEDULED,
      PipelineStage.LOST,
    ],
    // Terminal — no outgoing transitions
    [PipelineStage.WON]: [],
    [PipelineStage.LOST]: [],
  };

  /**
   * Stages where the lead is considered "active" (not won, not lost, not future).
   */
  static readonly ACTIVE_STAGES: PipelineStage[] = [
    PipelineStage.NEW,
    PipelineStage.SCHEDULED,
    PipelineStage.MET,
    PipelineStage.QUALIFIED,
    PipelineStage.PROPOSED,
    PipelineStage.NEGOTIATING,
  ];

  /**
   * Stages that are considered "closed" (won or lost).
   */
  static readonly CLOSED_STAGES: PipelineStage[] = [
    PipelineStage.WON,
    PipelineStage.LOST,
  ];

  /**
   * Checks if a transition from `from` to `to` is valid.
   * Same-stage transitions are always allowed (idempotent).
   */
  static isValidTransition(from: PipelineStage, to: PipelineStage): boolean {
    if (from === to) return true;
    const allowed = this.TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  /**
   * Validates a transition. Throws BadRequestException if invalid.
   * Returns void on success.
   */
  static validateTransition(from: PipelineStage, to: PipelineStage): void {
    if (this.isValidTransition(from, to)) return;

    const allowed = this.TRANSITIONS[from] ?? [];
    const allowedLabels = allowed.length > 0
      ? allowed.map((s) => s).join(', ')
      : 'none (terminal)';

    throw new BadRequestException(
      `Invalid stage transition: "${from}" → "${to}". ` +
      `Allowed transitions from "${from}": ${allowedLabels}.`,
    );
  }

  /**
   * Returns the list of valid next stages from the current stage.
   */
  static getValidNextStages(current: PipelineStage): PipelineStage[] {
    return this.TRANSITIONS[current] ?? [];
  }

  /**
   * Returns true if the stage is a terminal state (WON or LOST).
   */
  static isTerminal(stage: PipelineStage): boolean {
    return stage === PipelineStage.WON || stage === PipelineStage.LOST;
  }

  /**
   * Returns true if the stage is an active (in-pipeline) stage.
   */
  static isActive(stage: PipelineStage): boolean {
    return this.ACTIVE_STAGES.includes(stage);
  }

  /**
   * Returns true if the stage is FUTURE (reactivatable hold).
   */
  static isFuture(stage: PipelineStage): boolean {
    return stage === PipelineStage.FUTURE;
  }

  /**
   * Returns true if the transition moves a lead into FUTURE stage.
   */
  static isEnteringFuture(from: PipelineStage, to: PipelineStage): boolean {
    return to === PipelineStage.FUTURE;
  }

  /**
   * Returns true if the transition is entering a terminal state.
   */
  static isEnteringTerminal(from: PipelineStage, to: PipelineStage): boolean {
    return this.isTerminal(to);
  }
}
