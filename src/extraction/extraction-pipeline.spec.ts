import { ExtractionPipeline } from './extraction-pipeline.js';
import { PipelineStage, Temperature } from '@prisma/client';

describe('ExtractionPipeline', () => {
  // ─── mapAfrusLeadToWolverine ─────────────────────────────────────────────

  describe('mapAfrusLeadToWolverine', () => {
    it('maps basic lead fields', () => {
      const lead = {
        afrus_lead_id: 'afrus-123',
        email: 'John@Example.COM',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+57-300-123-4567',
        stage: 'qualified',
        temperature: 'warm',
        tags: [],
      };

      const result = ExtractionPipeline.mapAfrusLeadToWolverine(lead as any);

      expect(result.email).toBe('john@example.com'); // lowercased & trimmed
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.phone).toBe('+57-300-123-4567');
      expect(result.stage).toBe(PipelineStage.QUALIFIED);
      expect(result.temperature).toBe(Temperature.WARM);
      expect(result.afrusLeadId).toBe('afrus-123');
      expect(result.dealValue).toBeNull();
      expect(result.originTag).toBeNull();
    });

    it('normalizes email to lowercase', () => {
      const lead = { afrus_lead_id: 'x', email: 'TEST@GMAIL.COM', tags: [] } as any;
      expect(ExtractionPipeline.mapAfrusLeadToWolverine(lead).email).toBe('test@gmail.com');
    });

    it('extracts origin tag from tags array', () => {
      const lead = {
        afrus_lead_id: 'x',
        email: 'a@b.com',
        tags: ['stage:qualified', 'origin:linkedin', 'temp:warm'],
      } as any;
      expect(ExtractionPipeline.mapAfrusLeadToWolverine(lead).originTag).toBe('linkedin');
    });

    it('returns null originTag when no origin tag present', () => {
      const lead = { afrus_lead_id: 'x', email: 'a@b.com', tags: [] } as any;
      expect(ExtractionPipeline.mapAfrusLeadToWolverine(lead).originTag).toBeNull();
    });

    it('handles missing optional fields gracefully', () => {
      const lead = { afrus_lead_id: 'x', email: 'a@b.com' } as any;
      const result = ExtractionPipeline.mapAfrusLeadToWolverine(lead);
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.stage).toBe(PipelineStage.NEW);
      expect(result.temperature).toBe(Temperature.COLD);
    });
  });

  // ─── mapAfrusStage ───────────────────────────────────────────────────────

  describe('mapAfrusStage', () => {
    const cases: [string | undefined, PipelineStage][] = [
      ['new', PipelineStage.NEW],
      ['NEW', PipelineStage.NEW],
      ['scheduled', PipelineStage.SCHEDULED],
      ['met', PipelineStage.MET],
      ['qualified', PipelineStage.QUALIFIED],
      ['proposed', PipelineStage.PROPOSED],
      ['negotiating', PipelineStage.NEGOTIATING],
      ['future', PipelineStage.FUTURE],
      ['won', PipelineStage.WON],
      ['lost', PipelineStage.LOST],
      [undefined, PipelineStage.NEW],
      ['invalid_stage', PipelineStage.NEW],
      ['', PipelineStage.NEW],
    ];

    cases.forEach(([input, expected]) => {
      it(`"${input ?? 'undefined'}" → ${expected}`, () => {
        expect(ExtractionPipeline.mapAfrusStage(input)).toBe(expected);
      });
    });
  });

  // ─── mapAfrusTemperature ─────────────────────────────────────────────────

  describe('mapAfrusTemperature', () => {
    it('hot → HOT', () => expect(ExtractionPipeline.mapAfrusTemperature('hot')).toBe(Temperature.HOT));
    it('warm → WARM', () => expect(ExtractionPipeline.mapAfrusTemperature('warm')).toBe(Temperature.WARM));
    it('cold → COLD', () => expect(ExtractionPipeline.mapAfrusTemperature('cold')).toBe(Temperature.COLD));
    it('HOT → HOT', () => expect(ExtractionPipeline.mapAfrusTemperature('HOT')).toBe(Temperature.HOT));
    it('undefined → COLD (default)', () => expect(ExtractionPipeline.mapAfrusTemperature(undefined)).toBe(Temperature.COLD));
    it('invalid → COLD (default)', () => expect(ExtractionPipeline.mapAfrusTemperature('lukewarm')).toBe(Temperature.COLD));
  });

  // ─── extractOriginTag ────────────────────────────────────────────────────

  describe('extractOriginTag', () => {
    it('extracts origin from tag', () => {
      const lead = { tags: ['origin:linkedin'] } as any;
      expect(ExtractionPipeline.extractOriginTag(lead)).toBe('linkedin');
    });

    it('returns null when no origin tag', () => {
      const lead = { tags: ['stage:qualified'] } as any;
      expect(ExtractionPipeline.extractOriginTag(lead)).toBeNull();
    });

    it('returns null for empty tags', () => {
      const lead = { tags: [] } as any;
      expect(ExtractionPipeline.extractOriginTag(lead)).toBeNull();
    });

    it('trims whitespace', () => {
      const lead = { tags: ['origin:  linkedin  '] } as any;
      expect(ExtractionPipeline.extractOriginTag(lead)).toBe('linkedin');
    });
  });

  // ─── extractStageTag ─────────────────────────────────────────────────────

  describe('extractStageTag', () => {
    it('extracts stage tag', () => {
      const lead = { tags: ['stage:qualified'] } as any;
      expect(ExtractionPipeline.extractStageTag(lead)).toBe('qualified');
    });

    it('returns null when no stage tag', () => {
      const lead = { tags: ['origin:linkedin'] } as any;
      expect(ExtractionPipeline.extractStageTag(lead)).toBeNull();
    });
  });

  // ─── extractTempTag ──────────────────────────────────────────────────────

  describe('extractTempTag', () => {
    it('extracts temp tag', () => {
      const lead = { tags: ['temp:warm'] } as any;
      expect(ExtractionPipeline.extractTempTag(lead)).toBe('warm');
    });

    it('returns null when no temp tag', () => {
      const lead = { tags: ['stage:qualified'] } as any;
      expect(ExtractionPipeline.extractTempTag(lead)).toBeNull();
    });
  });
});
