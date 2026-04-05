import { BadRequestException } from '@nestjs/common';
import { RuleEngine } from './rule-engine.js';
import { PipelineStage, Temperature } from '@prisma/client';
import type { TransitionContext } from './rule-engine.js';

const NEW = PipelineStage.NEW;
const SCHEDULED = PipelineStage.SCHEDULED;
const MET = PipelineStage.MET;
const QUALIFIED = PipelineStage.QUALIFIED;
const PROPOSED = PipelineStage.PROPOSED;
const NEGOTIATING = PipelineStage.NEGOTIATING;
const FUTURE = PipelineStage.FUTURE;
const WON = PipelineStage.WON;
const LOST = PipelineStage.LOST;

const makeCtx = (overrides: Partial<{
  currentStage: PipelineStage;
  currentTemperature: Temperature;
  dealValue: number | null;
  scheduledAt: Date | null;
  metAt: Date | null;
  lostReasonId: string;
}> = {}): TransitionContext => ({
  leadEmail: 'test@example.com',
  organizationId: 'org-1',
  currentStage: overrides.currentStage ?? NEW,
  currentTemperature: Temperature.COLD,
  scheduledAt: overrides.scheduledAt ?? null,
  metAt: overrides.metAt ?? null,
  assignedToId: 'sdr-1',
  dealValue: overrides.dealValue ?? null,
});

describe('RuleEngine', () => {
  // ─── Same-stage (idempotent) ─────────────────────────────────────────────

  describe('same-stage transition', () => {
    it('is always valid and returns empty side effects', () => {
      const ctx = makeCtx({ currentStage: NEW });
      const result = RuleEngine.evaluate(ctx, NEW);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sideEffects).toHaveLength(0);
      expect(result.afrusSyncInstructions).toHaveLength(0);
    });
  });

  // ─── NEW → LOST ────────────────────────────────────────────────────────

  describe('NEW → LOST', () => {
    it('valid with lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), LOST, 'reason-1');
      expect(result.valid).toBe(true);
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'clear_sla' }),
      );
      expect(result.afrusSyncInstructions[0]).toMatchObject({
        operation: 'UPDATE_LEAD_STAGE',
        payload: { stage: 'LOST' },
      });
    });

    it('invalid without lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), LOST);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('lostReasonId');
    });

    it('throws with evaluateOrThrow when missing lostReasonId', () => {
      expect(() =>
        RuleEngine.evaluateOrThrow(makeCtx({ currentStage: NEW }), LOST),
      ).toThrow(BadRequestException);
    });
  });

  // ─── SCHEDULED → LOST ─────────────────────────────────────────────────

  describe('SCHEDULED → LOST', () => {
    it('valid with lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: SCHEDULED }), LOST, 'reason-1');
      expect(result.valid).toBe(true);
    });

    it('invalid without lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: SCHEDULED }), LOST);
      expect(result.valid).toBe(false);
    });
  });

  // ─── MET → LOST ────────────────────────────────────────────────────────

  describe('MET → LOST', () => {
    it('valid with lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: MET }), LOST, 'reason-1');
      expect(result.valid).toBe(true);
    });

    it('invalid without lostReasonId', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: MET }), LOST);
      expect(result.valid).toBe(false);
    });
  });

  // ─── NEW → PROPOSED / NEGOTIATING ─────────────────────────────────────

  describe('NEW → PROPOSED', () => {
    it('valid when dealValue is set', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: 5000 }), PROPOSED);
      expect(result.valid).toBe(true);
    });

    it('invalid when dealValue is null', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: null }), PROPOSED);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('dealValue');
    });

    it('invalid when dealValue is 0', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: 0 }), PROPOSED);
      expect(result.valid).toBe(false);
    });
  });

  describe('NEW → NEGOTIATING', () => {
    it('valid when dealValue > 0', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: 100 }), NEGOTIATING);
      expect(result.valid).toBe(true);
    });

    it('invalid when dealValue is null', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: null }), NEGOTIATING);
      expect(result.valid).toBe(false);
    });
  });

  // ─── NEW → WON ────────────────────────────────────────────────────────

  describe('NEW → WON', () => {
    it('valid with dealValue', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW, dealValue: 10000 }), WON);
      expect(result.valid).toBe(true);
    });

    it('invalid without dealValue', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), WON);
      expect(result.valid).toBe(false);
    });
  });

  // ─── Invalid state machine transitions ─────────────────────────────────

  describe('invalid state machine transitions', () => {
    it('rejects WON → anything (terminal state)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: WON }), NEW);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid transition');
    });

    it('rejects LOST → anything (terminal state)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: LOST }), SCHEDULED);
      expect(result.valid).toBe(false);
    });

    it('rejects FUTURE → WON (must go through pipeline)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: FUTURE }), WON);
      expect(result.valid).toBe(false);
    });

    it('rejects SCHEDULED → WON (must meet first)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: SCHEDULED }), WON);
      expect(result.valid).toBe(false);
    });
  });

  // ─── Side effects ─────────────────────────────────────────────────────

  describe('side effects', () => {
    it('→ SCHEDULED emits start_sla and notify_sdr', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), SCHEDULED);
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'start_sla', payload: { stage: PipelineStage.SCHEDULED } }),
      );
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'notify_sdr' }),
      );
    });

    it('→ LOST emits clear_sla', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), LOST, 'r1');
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'clear_sla' }),
      );
    });

    it('→ FUTURE emits clear_sla (SLA paused)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: NEW }), FUTURE);
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'clear_sla' }),
      );
    });
  });

  // ─── Default permissive rule ───────────────────────────────────────────

  describe('default permissive rule (no explicit rule defined)', () => {
    it('allows MET → QUALIFIED without preconditions', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: MET }), QUALIFIED);
      expect(result.valid).toBe(true);
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'start_sla' }),
      );
    });

    it('allows QUALIFIED → PROPOSED without preconditions', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: QUALIFIED }), PROPOSED);
      expect(result.valid).toBe(true);
    });

    it('allows MET → SCHEDULED (follow-up meeting)', () => {
      const result = RuleEngine.evaluate(makeCtx({ currentStage: MET }), SCHEDULED);
      expect(result.valid).toBe(true);
    });
  });

  // ─── getRules ─────────────────────────────────────────────────────────

  describe('getRules', () => {
    it('returns all registered rules', () => {
      const rules = RuleEngine.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules).toContainEqual(
        expect.objectContaining({ from: 'NEW', to: 'LOST' }),
      );
    });
  });
});
