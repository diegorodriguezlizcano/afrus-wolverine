import { SlaMonitor, SLA_CONFIG } from './sla-monitor.js';
import { PipelineStage, Temperature } from '@prisma/client';

const NEW = PipelineStage.NEW;
const SCHEDULED = PipelineStage.SCHEDULED;
const MET = PipelineStage.MET;
const FUTURE = PipelineStage.FUTURE;

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const now = new Date();

describe('SlaMonitor', () => {
  // ─── calculateStatus ────────────────────────────────────────────────────

  describe('calculateStatus', () => {
    it('NEW with 10h elapsed → not breached', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(10), now);
      expect(status.isBreached).toBe(false);
      expect(status.isStale).toBe(false);
      expect(status.percentUsed).toBeCloseTo(42, 0);
    });

    it('NEW with 25h elapsed → breached (24h SLA)', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(25), now);
      expect(status.isBreached).toBe(true);
      expect(status.isStale).toBe(false);
    });

    it('NEW with 50h elapsed → stale (48h = 2×24h)', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(50), now);
      expect(status.isBreached).toBe(true);
      expect(status.isStale).toBe(true);
    });

    it('SCHEDULED with 70h → breached (72h SLA)', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', SCHEDULED, hoursAgo(70), now);
      expect(status.isBreached).toBe(false);
      expect(status.percentUsed).toBeCloseTo(97, 0);
    });

    it('SCHEDULED with 145h → stale (144h = 2×72h)', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', SCHEDULED, hoursAgo(145), now);
      expect(status.isStale).toBe(true);
    });

    it('MET with 24h → not breached (48h SLA)', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', MET, hoursAgo(24), now);
      expect(status.isBreached).toBe(false);
      expect(status.percentUsed).toBeCloseTo(50, 0);
    });

    it('FUTURE has no SLA', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', FUTURE, hoursAgo(1000), now);
      expect(status.isBreached).toBe(false);
      expect(status.isStale).toBe(false);
      expect(status.slaHours).toBe(0);
      expect(status.percentUsed).toBe(0);
    });

    it('exact SLA boundary is not breached', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(24), now);
      expect(status.isBreached).toBe(false); // strictly greater than
    });

    it('exact 2× SLA boundary is not stale', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(48), now);
      expect(status.isStale).toBe(false); // strictly greater than
    });
  });

  // ─── shouldDowngrade ─────────────────────────────────────────────────────

  describe('shouldDowngrade', () => {
    it('HOT stale lead → downgrade to WARM', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(50), now);
      expect(SlaMonitor.shouldDowngrade(status, Temperature.HOT)).toBe(Temperature.WARM);
    });

    it('WARM stale lead → downgrade to COLD', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(50), now);
      expect(SlaMonitor.shouldDowngrade(status, Temperature.WARM)).toBe(Temperature.COLD);
    });

    it('COLD stale lead → no downgrade', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(50), now);
      expect(SlaMonitor.shouldDowngrade(status, Temperature.COLD)).toBeNull();
    });

    it('HOT non-stale lead → no downgrade', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(10), now);
      expect(SlaMonitor.shouldDowngrade(status, Temperature.HOT)).toBeNull();
    });

    it('WARM non-stale lead → no downgrade', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(10), now);
      expect(SlaMonitor.shouldDowngrade(status, Temperature.WARM)).toBeNull();
    });
  });

  // ─── getUrgencyLabel ───────────────────────────────────────────────────

  describe('getUrgencyLabel', () => {
    it('0% SLA → ok', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', FUTURE, hoursAgo(100), now);
      expect(SlaMonitor.getUrgencyLabel(status)).toBe('ok');
    });

    it('50% SLA → ok', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(12), now);
      expect(SlaMonitor.getUrgencyLabel(status)).toBe('ok');
    });

    it('80%+ SLA → at_risk', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(20), now);
      expect(SlaMonitor.getUrgencyLabel(status)).toBe('at_risk');
    });

    it('>100% SLA → breached', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(25), now);
      expect(SlaMonitor.getUrgencyLabel(status)).toBe('breached');
    });

    it('>200% SLA → stale', () => {
      const status = SlaMonitor.calculateStatus('a@b.com', NEW, hoursAgo(50), now);
      expect(SlaMonitor.getUrgencyLabel(status)).toBe('stale');
    });
  });

  // ─── getAlertMessage ────────────────────────────────────────────────────

  describe('getAlertMessage', () => {
    it('includes email, stage, hours, SLA, and assignee', () => {
      const status = SlaMonitor.calculateStatus('john@example.com', NEW, hoursAgo(50), now);
      const msg = SlaMonitor.getAlertMessage(status, 'sdr@afrus.ai');
      expect(msg).toContain('john@example.com');
      expect(msg).toContain('NEW');
      expect(msg).toContain('50');
      expect(msg).toContain('24');
      expect(msg).toContain('sdr@afrus.ai');
      expect(msg).toContain('STALE');
    });

    it('works without assignee', () => {
      const status = SlaMonitor.calculateStatus('jane@example.com', SCHEDULED, hoursAgo(145), now);
      const msg = SlaMonitor.getAlertMessage(status);
      expect(msg).toContain('jane@example.com');
      expect(msg).not.toContain('SDR');
    });
  });

  // ─── SLA_CONFIG constants ────────────────────────────────────────────────

  describe('SLA_CONFIG', () => {
    it('NEW = 24h', () => expect(SLA_CONFIG[NEW].slaHours).toBe(24));
    it('SCHEDULED = 72h', () => expect(SLA_CONFIG[SCHEDULED].slaHours).toBe(72));
    it('MET = 48h', () => expect(SLA_CONFIG[MET].slaHours).toBe(48));
    it('FUTURE = 0h', () => expect(SLA_CONFIG[FUTURE].slaHours).toBe(0));
  });
});
