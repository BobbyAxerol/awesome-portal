import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, it, expect } from 'vitest';
import { buildPositiveManagerSeries } from '../tooling/execution-manager-positive-series-fixtures.mjs';
import { managerSeriesResponse } from '../../../apps/control-api/src/execution-v2/manager-series.contract';
const load = (path: string) => JSON.parse(readFileSync(resolve(__dirname, '..', path), 'utf8'));
const template = () => load('fixtures/execution-manager-series.populated.synthetic.valid.json').value;
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(load('schemas/execution-manager-series.v1.schema.json'));
describe('complete synthetic Manager series for UI review', () => {
  it.each([3, 240, 1440])('validates all four views at %i points against JSON Schema and producer Zod', pointCount => {
    const source = template();
    const before = structuredClone(source);
    const responses = buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav: source, pointCount });
    for (const body of Object.values(responses) as any[]) {
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(managerSeriesResponse.safeParse(body).success).toBe(true);
      expect(body.quality).toEqual({ completeness: 'COMPLETE', freshness: 'FRESH', reasons: [] });
      for (const entry of body.series) {
        expect(entry.points).toHaveLength(pointCount);
        expect(entry.gaps).toEqual([]);
        expect(new Set(entry.points.map((p: any) => p.ts_ms)).size).toBe(pointCount);
        expect(entry.points.at(-1).ts_ms).toBe(entry.window.to_ms - 1);
      }
    }
    expect(source).toEqual(before);
    expect(buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav: source, pointCount })).toEqual(responses);
  });
  it('keeps shared identity, opening/closing NAV, zero initial returns and nonpositive drawdown', () => {
    const source = template();
    const out = buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav: source });
    for (let i = 0; i < source.series.length; i++) {
      expect(out.NAV.series[i].subject).toEqual(source.series[i].subject);
      expect(Number(out.NAV.series[i].points.at(-1).value)).toBe(Number(source.series[i].points.at(-1).value));
      for (const key of ['RETURN', 'NET_PNL', 'DRAWDOWN']) expect(out[key].series[i].points[0].value).toBe('0');
      expect(out.DRAWDOWN.series[i].points.every((p: any) => Number(p.value) <= 0)).toBe(true);
    }
  });
  it('does not align different economic books or accept an unavailable template', () => {
    const nav = template(); nav.series[1].partition.native_profile_ref = 'FIXTURE_LAB:another-book';
    const out = buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav });
    expect(out.NAV.comparison.state).toBe('INCOMPARABLE');
    nav.series[0].state = 'UNAVAILABLE';
    expect(() => buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav })).toThrow();
    expect(() => buildPositiveManagerSeries({ lane: 'REAL', nav: template() })).toThrow();
  });
  it('preserves ALPHA/FUND identity and follows producer currency semantics for money versus ratios', () => {
    const nav = template();
    nav.series[0].subject = { subject_type: 'ALPHA', subject_id: 'alpha_a' };
    nav.series[1].subject = { subject_type: 'FUND', subject_id: nav.workspace_id };
    nav.series[1].partition.currency = 'EUR'; nav.series[1].currency = 'EUR';
    const out = buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav });
    for (const body of Object.values(out) as any[]) {
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(managerSeriesResponse.safeParse(body).success).toBe(true);
      expect(body.comparison.reason_code).toBe(['NAV', 'NET_PNL'].includes(body.metric) ? 'CURRENCY_MIXED' : null);
      expect(body.series.map((r: any) => r.subject)).toEqual(nav.series.map((r: any) => r.subject));
    }
  });
});
