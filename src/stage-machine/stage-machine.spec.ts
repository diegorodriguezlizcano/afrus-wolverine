import { BadRequestException } from '@nestjs/common';
import { StageMachine } from './stage-machine.js';
import { PipelineStage } from '@prisma/client';

const NEW = PipelineStage.NEW;
const SCHEDULED = PipelineStage.SCHEDULED;
const MET = PipelineStage.MET;
const QUALIFIED = PipelineStage.QUALIFIED;
const PROPOSED = PipelineStage.PROPOSED;
const NEGOTIATING = PipelineStage.NEGOTIATING;
const FUTURE = PipelineStage.FUTURE;
const WON = PipelineStage.WON;
const LOST = PipelineStage.LOST;

describe('StageMachine', () => {
  // ─── isValidTransition ────────────────────────────────────────────────────

  describe('isValidTransition', () => {
    it('allows same-stage transitions (idempotent)', () => {
      expect(StageMachine.isValidTransition(NEW, NEW)).toBe(true);
      expect(StageMachine.isValidTransition(SCHEDULED, SCHEDULED)).toBe(true);
      expect(StageMachine.isValidTransition(WON, WON)).toBe(true);
    });

    describe('from NEW', () => {
      it('allows NEW → SCHEDULED', () => expect(StageMachine.isValidTransition(NEW, SCHEDULED)).toBe(true));
      it('allows NEW → QUALIFIED', () => expect(StageMachine.isValidTransition(NEW, QUALIFIED)).toBe(true));
      it('allows NEW → PROPOSED', () => expect(StageMachine.isValidTransition(NEW, PROPOSED)).toBe(true));
      it('allows NEW → NEGOTIATING', () => expect(StageMachine.isValidTransition(NEW, NEGOTIATING)).toBe(true));
      it('allows NEW → FUTURE', () => expect(StageMachine.isValidTransition(NEW, FUTURE)).toBe(true));
      it('allows NEW → WON', () => expect(StageMachine.isValidTransition(NEW, WON)).toBe(true));
      it('allows NEW → LOST', () => expect(StageMachine.isValidTransition(NEW, LOST)).toBe(true));
      it('allows NEW → MET (skip — imported after first meeting)', () => expect(StageMachine.isValidTransition(NEW, MET)).toBe(true));
    });

    describe('from SCHEDULED', () => {
      it('allows SCHEDULED → MET', () => expect(StageMachine.isValidTransition(SCHEDULED, MET)).toBe(true));
      it('allows SCHEDULED → QUALIFIED', () => expect(StageMachine.isValidTransition(SCHEDULED, QUALIFIED)).toBe(true));
      it('allows SCHEDULED → FUTURE', () => expect(StageMachine.isValidTransition(SCHEDULED, FUTURE)).toBe(true));
      it('allows SCHEDULED → LOST', () => expect(StageMachine.isValidTransition(SCHEDULED, LOST)).toBe(true));
      it('allows SCHEDULED → NEW (reschedule)', () => expect(StageMachine.isValidTransition(SCHEDULED, NEW)).toBe(true));
      it('rejects SCHEDULED → WON (must meet first)', () => expect(StageMachine.isValidTransition(SCHEDULED, WON)).toBe(false));
      it('rejects SCHEDULED → PROPOSED', () => expect(StageMachine.isValidTransition(SCHEDULED, PROPOSED)).toBe(false));
    });

    describe('from MET', () => {
      it('allows MET → QUALIFIED', () => expect(StageMachine.isValidTransition(MET, QUALIFIED)).toBe(true));
      it('allows MET → PROPOSED', () => expect(StageMachine.isValidTransition(MET, PROPOSED)).toBe(true));
      it('allows MET → NEGOTIATING', () => expect(StageMachine.isValidTransition(MET, NEGOTIATING)).toBe(true));
      it('allows MET → WON', () => expect(StageMachine.isValidTransition(MET, WON)).toBe(true));
      it('allows MET → LOST', () => expect(StageMachine.isValidTransition(MET, LOST)).toBe(true));
      it('allows MET → FUTURE', () => expect(StageMachine.isValidTransition(MET, FUTURE)).toBe(true));
      it('allows MET → SCHEDULED (follow-up meeting)', () => expect(StageMachine.isValidTransition(MET, SCHEDULED)).toBe(true));
      it('rejects MET → NEW', () => expect(StageMachine.isValidTransition(MET, NEW)).toBe(false));
    });

    describe('from QUALIFIED', () => {
      it('allows QUALIFIED → PROPOSED', () => expect(StageMachine.isValidTransition(QUALIFIED, PROPOSED)).toBe(true));
      it('allows QUALIFIED → NEGOTIATING', () => expect(StageMachine.isValidTransition(QUALIFIED, NEGOTIATING)).toBe(true));
      it('allows QUALIFIED → WON', () => expect(StageMachine.isValidTransition(QUALIFIED, WON)).toBe(true));
      it('allows QUALIFIED → LOST', () => expect(StageMachine.isValidTransition(QUALIFIED, LOST)).toBe(true));
      it('allows QUALIFIED → FUTURE', () => expect(StageMachine.isValidTransition(QUALIFIED, FUTURE)).toBe(true));
      it('allows QUALIFIED → SCHEDULED (re-engage)', () => expect(StageMachine.isValidTransition(QUALIFIED, SCHEDULED)).toBe(true));
      it('rejects QUALIFIED → MET', () => expect(StageMachine.isValidTransition(QUALIFIED, MET)).toBe(false));
    });

    describe('from PROPOSED', () => {
      it('allows PROPOSED → NEGOTIATING', () => expect(StageMachine.isValidTransition(PROPOSED, NEGOTIATING)).toBe(true));
      it('allows PROPOSED → WON', () => expect(StageMachine.isValidTransition(PROPOSED, WON)).toBe(true));
      it('allows PROPOSED → LOST', () => expect(StageMachine.isValidTransition(PROPOSED, LOST)).toBe(true));
      it('allows PROPOSED → FUTURE', () => expect(StageMachine.isValidTransition(PROPOSED, FUTURE)).toBe(true));
      it('allows PROPOSED → QUALIFIED (go back)', () => expect(StageMachine.isValidTransition(PROPOSED, QUALIFIED)).toBe(true));
      it('allows PROPOSED → SCHEDULED', () => expect(StageMachine.isValidTransition(PROPOSED, SCHEDULED)).toBe(true));
      it('rejects PROPOSED → MET', () => expect(StageMachine.isValidTransition(PROPOSED, MET)).toBe(false));
    });

    describe('from NEGOTIATING', () => {
      it('allows NEGOTIATING → WON', () => expect(StageMachine.isValidTransition(NEGOTIATING, WON)).toBe(true));
      it('allows NEGOTIATING → LOST', () => expect(StageMachine.isValidTransition(NEGOTIATING, LOST)).toBe(true));
      it('allows NEGOTIATING → PROPOSED (go back)', () => expect(StageMachine.isValidTransition(NEGOTIATING, PROPOSED)).toBe(true));
      it('allows NEGOTIATING → SCHEDULED', () => expect(StageMachine.isValidTransition(NEGOTIATING, SCHEDULED)).toBe(true));
      it('rejects NEGOTIATING → MET', () => expect(StageMachine.isValidTransition(NEGOTIATING, MET)).toBe(false));
      it('rejects NEGOTIATING → FUTURE', () => expect(StageMachine.isValidTransition(NEGOTIATING, FUTURE)).toBe(false));
    });

    describe('from FUTURE', () => {
      it('allows FUTURE → SCHEDULED (reactivate)', () => expect(StageMachine.isValidTransition(FUTURE, SCHEDULED)).toBe(true));
      it('allows FUTURE → LOST', () => expect(StageMachine.isValidTransition(FUTURE, LOST)).toBe(true));
      it('rejects FUTURE → WON (must go through pipeline)', () => expect(StageMachine.isValidTransition(FUTURE, WON)).toBe(false));
      it('rejects FUTURE → MET', () => expect(StageMachine.isValidTransition(FUTURE, MET)).toBe(false));
    });

    describe('terminal states', () => {
      it('WON has no outgoing transitions', () => {
        expect(StageMachine.getValidNextStages(WON)).toHaveLength(0);
      });
      it('LOST has no outgoing transitions', () => {
        expect(StageMachine.getValidNextStages(LOST)).toHaveLength(0);
      });
    });
  });

  // ─── validateTransition ──────────────────────────────────────────────────

  describe('validateTransition', () => {
    it('returns void for valid transitions', () => {
      expect(() => StageMachine.validateTransition(NEW, SCHEDULED)).not.toThrow();
    });

    it('throws BadRequestException for invalid transitions', () => {
      expect(() => StageMachine.validateTransition(SCHEDULED, WON)).toThrow(BadRequestException);
    });

    it('error message lists allowed stages', () => {
      try {
        StageMachine.validateTransition(SCHEDULED, WON);
        fail('Expected BadRequestException');
      } catch (err) {
        expect((err as BadRequestException).message).toContain('SCHEDULED');
        expect((err as BadRequestException).message).toContain('WON');
        expect((err as BadRequestException).message).toContain('MET');
        expect((err as BadRequestException).message).toContain('QUALIFIED');
      }
    });
  });

  // ─── getValidNextStages ─────────────────────────────────────────────────

  describe('getValidNextStages', () => {
    it('NEW allows 8 next stages', () => {
      const stages = StageMachine.getValidNextStages(NEW);
      expect(stages).toContain(SCHEDULED);
      expect(stages).toContain(QUALIFIED);
      expect(stages).toContain(FUTURE);
      expect(stages).toContain(WON);
      expect(stages).toContain(LOST);
      expect(stages).toContain(MET);
      expect(stages).not.toContain(NEW);
    });

    it('FUTURE only allows 2 next stages', () => {
      const stages = StageMachine.getValidNextStages(FUTURE);
      expect(stages).toHaveLength(2);
      expect(stages).toContain(SCHEDULED);
      expect(stages).toContain(LOST);
    });
  });

  // ─── Stage helpers ──────────────────────────────────────────────────────

  describe('Stage helpers', () => {
    it('isTerminal: WON and LOST are terminal', () => {
      expect(StageMachine.isTerminal(WON)).toBe(true);
      expect(StageMachine.isTerminal(LOST)).toBe(true);
      expect(StageMachine.isTerminal(NEW)).toBe(false);
      expect(StageMachine.isTerminal(FUTURE)).toBe(false);
    });

    it('isActive: includes all pipeline stages except WON, LOST, FUTURE', () => {
      expect(StageMachine.isActive(NEW)).toBe(true);
      expect(StageMachine.isActive(SCHEDULED)).toBe(true);
      expect(StageMachine.isActive(MET)).toBe(true);
      expect(StageMachine.isActive(QUALIFIED)).toBe(true);
      expect(StageMachine.isActive(PROPOSED)).toBe(true);
      expect(StageMachine.isActive(NEGOTIATING)).toBe(true);
      expect(StageMachine.isActive(WON)).toBe(false);
      expect(StageMachine.isActive(LOST)).toBe(false);
      expect(StageMachine.isActive(FUTURE)).toBe(false);
    });

    it('isFuture: only FUTURE is true', () => {
      expect(StageMachine.isFuture(FUTURE)).toBe(true);
      expect(StageMachine.isFuture(NEW)).toBe(false);
    });

    it('isEnteringFuture: correctly identifies entering FUTURE', () => {
      expect(StageMachine.isEnteringFuture(NEW, FUTURE)).toBe(true);
      expect(StageMachine.isEnteringFuture(MET, FUTURE)).toBe(true);
      expect(StageMachine.isEnteringFuture(NEW, LOST)).toBe(false);
    });

    it('isEnteringTerminal: correctly identifies terminal entry', () => {
      expect(StageMachine.isEnteringTerminal(NEW, WON)).toBe(true);
      expect(StageMachine.isEnteringTerminal(MET, LOST)).toBe(true);
      expect(StageMachine.isEnteringTerminal(NEW, SCHEDULED)).toBe(false);
    });
  });
});
