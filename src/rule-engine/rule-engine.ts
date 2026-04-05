import { BadRequestException } from '@nestjs/common';
import { PipelineStage, Temperature } from '@prisma/client';
import { StageMachine } from '../stage-machine/stage-machine.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransitionContext {
  leadEmail: string;
  organizationId: string;
  currentStage: PipelineStage;
  currentTemperature: Temperature;
  scheduledAt: Date | null;
  metAt: Date | null;
  assignedToId: string | null;
  dealValue: number | null;
  /** Pre-loaded list of valid lost reason IDs for this org (if needed) */
  validLostReasonIds?: string[];
}

export interface RuleResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sideEffects: SideEffect[];
  afrusSyncInstructions: AfrusSyncInstruction[];
}

/** Side effects to be executed by the calling layer (not in this class). */
export type SideEffectType = 'clear_sla' | 'start_sla' | 'notify_sdr' | 'sync_to_afrus';

export interface SideEffect {
  type: SideEffectType;
  payload: Record<string, unknown>;
}

export interface AfrusSyncInstruction {
  operation: 'UPDATE_LEAD_STAGE' | 'UPDATE_LEAD_TEMPERATURE' | 'UPDATE_LEAD_SDR';
  payload: Record<string, unknown>;
}

// ─── Rule Definition ─────────────────────────────────────────────────────────

interface TransitionRule {
  /** Human-readable label */
  label: string;
  /**
   * Preconditions that must all be true for the transition to be allowed.
   * Return null if met; return error string if not met.
   */
  preconditions: Array<(ctx: TransitionContext, toStage: PipelineStage, lostReasonId?: string) => string | null>;
  /** Side effects to be fired by the caller. */
  sideEffects: SideEffect[];
  /** afrus sync instructions returned to calling layer. */
  afrusSync: AfrusSyncInstruction[];
}

// ─── All 14 Transition Rules ─────────────────────────────────────────────────

/**
 * Declarative rule table. Each entry is keyed by "FROM_STAGE → TO_STAGE".
 * This is the heart of the Rule Engine — all business logic lives here.
 */
const RULES: Record<string, TransitionRule | undefined> = {
  // ── NEW ──────────────────────────────────────────────────────────────────

  'NEW → SCHEDULED': {
    label: 'Schedule meeting',
    preconditions: [
      () => null, // No preconditions — any lead can be scheduled
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.SCHEDULED } },
      { type: 'notify_sdr', payload: { event: 'meeting_scheduled' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'SCHEDULED' } },
    ],
  },

  'NEW → MET': {
    label: 'Mark as met directly (imported)',
    preconditions: [
      () => null,
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.MET } },
      { type: 'notify_sdr', payload: { event: 'met_direct' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'MET' } },
    ],
  },

  'NEW → QUALIFIED': {
    label: 'Qualify lead directly',
    preconditions: [
      () => null,
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.QUALIFIED } },
      { type: 'notify_sdr', payload: { event: 'qualified' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'QUALIFIED' } },
    ],
  },

  'NEW → PROPOSED': {
    label: 'Jump to proposal',
    preconditions: [
      (ctx) =>
        ctx.dealValue !== null && ctx.dealValue > 0
          ? null
          : 'dealValue must be set to advance to PROPOSED',
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.PROPOSED } },
      { type: 'notify_sdr', payload: { event: 'proposal_sent' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'PROPOSED' } },
    ],
  },

  'NEW → NEGOTIATING': {
    label: 'Jump to negotiation',
    preconditions: [
      (ctx) =>
        ctx.dealValue !== null && ctx.dealValue > 0
          ? null
          : 'dealValue must be set to advance to NEGOTIATING',
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.NEGOTIATING } },
      { type: 'notify_sdr', payload: { event: 'in_negotiation' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'NEGOTIATING' } },
    ],
  },

  'NEW → FUTURE': {
    label: 'Move to future hold',
    preconditions: [
      () => null,
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'FUTURE' } },
    ],
  },

  'NEW → WON': {
    label: 'Close as won from new',
    preconditions: [
      (ctx) =>
        ctx.dealValue !== null && ctx.dealValue > 0
          ? null
          : 'dealValue must be set to close as WON',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'deal_won' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'WON' } },
    ],
  },

  'NEW → LOST': {
    label: 'Mark as lost from new',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── SCHEDULED ──────────────────────────────────────────────────────────────

  'SCHEDULED → MET': {
    label: 'Mark meeting as completed',
    preconditions: [
      (ctx) =>
        ctx.scheduledAt !== null
          ? null
          : 'scheduledAt must be set before marking as MET',
    ],
    sideEffects: [
      { type: 'start_sla', payload: { stage: PipelineStage.MET } },
      { type: 'notify_sdr', payload: { event: 'meeting_completed' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'MET' } },
    ],
  },

  'SCHEDULED → LOST': {
    label: 'Lost after scheduled',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── MET ────────────────────────────────────────────────────────────────────

  'MET → LOST': {
    label: 'Lost after meeting',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── QUALIFIED ──────────────────────────────────────────────────────────────

  'QUALIFIED → LOST': {
    label: 'Lost after qualified',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── PROPOSED ───────────────────────────────────────────────────────────────

  'PROPOSED → LOST': {
    label: 'Lost after proposal',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── NEGOTIATING ─────────────────────────────────────────────────────────────

  'NEGOTIATING → LOST': {
    label: 'Lost in negotiation',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },

  // ── FUTURE ─────────────────────────────────────────────────────────────────

  'FUTURE → LOST': {
    label: 'Lost from future hold',
    preconditions: [
      (ctx, _toStage, lostReasonId) =>
        lostReasonId ? null : 'lostReasonId is required for → LOST transitions',
    ],
    sideEffects: [
      { type: 'clear_sla', payload: {} },
      { type: 'notify_sdr', payload: { event: 'lead_lost' } },
    ],
    afrusSync: [
      { operation: 'UPDATE_LEAD_STAGE', payload: { stage: 'LOST' } },
    ],
  },
};

// ─── Rule Engine ─────────────────────────────────────────────────────────────

export class RuleEngine {
  /**
   * Evaluates all preconditions for a proposed transition.
   * Returns a RuleResult that the caller must handle.
   *
   * Does NOT throw — returns errors in the result object.
   */
  static evaluate(
    ctx: TransitionContext,
    toStage: PipelineStage,
    lostReasonId?: string,
  ): RuleResult {
    const fromStage = ctx.currentStage;

    // ── 1. State machine check ─────────────────────────────────────────────
    if (!StageMachine.isValidTransition(fromStage, toStage)) {
      const validStages = StageMachine.getValidNextStages(fromStage);
      return {
        valid: false,
        errors: [
          `Invalid transition: "${fromStage}" → "${toStage}". ` +
          `Allowed: ${validStages.join(', ') || 'none'}.`,
        ],
        warnings: [],
        sideEffects: [],
        afrusSyncInstructions: [],
      };
    }

    // ── 2. Same-stage: always allowed (idempotent) ─────────────────────────
    if (fromStage === toStage) {
      return { valid: true, errors: [], warnings: [], sideEffects: [], afrusSyncInstructions: [] };
    }

    // ── 3. Rule lookup ─────────────────────────────────────────────────────
    const rule = RULES[`${fromStage} → ${toStage}`];

    // If no specific rule (e.g., MET → QUALIFIED, QUALIFIED → PROPOSED, etc.)
    // apply a default permissive rule
    const effectiveRule: TransitionRule = rule ?? {
      label: `${fromStage} → ${toStage}`,
      preconditions: [() => null],
      sideEffects: [
        { type: 'start_sla', payload: { stage: toStage } },
        { type: 'sync_to_afrus', payload: {} },
      ],
      afrusSync: [
        { operation: 'UPDATE_LEAD_STAGE', payload: { stage: toStage } },
      ],
    };

    // ── 4. Evaluate preconditions ──────────────────────────────────────────
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const precondition of effectiveRule.preconditions) {
      const error = precondition(ctx, toStage, lostReasonId);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        warnings,
        sideEffects: [],
        afrusSyncInstructions: [],
      };
    }

    // ── 5. Success ──────────────────────────────────────────────────────────
    return {
      valid: true,
      errors: [],
      warnings,
      sideEffects: effectiveRule.sideEffects,
      afrusSyncInstructions: effectiveRule.afrusSync,
    };
  }

  /**
   * Strict version: throws BadRequestException if evaluation fails.
   * Use this when you want automatic rejection.
   */
  static evaluateOrThrow(
    ctx: TransitionContext,
    toStage: PipelineStage,
    lostReasonId?: string,
  ): RuleResult {
    const result = this.evaluate(ctx, toStage, lostReasonId);
    if (!result.valid) {
      throw new BadRequestException(result.errors.join('; '));
    }
    return result;
  }

  /**
   * Returns all registered rules (for debugging/admin).
   */
  static getRules(): Array<{ from: string; to: string; label: string }> {
    return Object.entries(RULES)
      .filter(([, rule]) => rule !== undefined)
      .map(([key, rule]) => {
        const [from, to] = key.split(' → ');
        return { from, to, label: rule!.label };
      });
  }
}
