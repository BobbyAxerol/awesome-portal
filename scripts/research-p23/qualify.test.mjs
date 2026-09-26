import { describe, expect, it } from 'vitest';
import { P23_TESTS, buildQualificationReceipt, validateQualificationConfig } from './qualify.mjs';

const config = { project: 'portal-research-p23-ol12', base_url: 'http://127.0.0.1:8096/' };

describe('OL-12 P23 qualification harness', () => {
  it('keeps the exact T01-T15 matrix and fails closed without receipts', () => {
    expect(P23_TESTS).toHaveLength(15);
    expect(P23_TESTS.map(([id]) => id)).toEqual(Array.from({ length: 15 }, (_, i) => `P23-T${String(i + 1).padStart(2, '0')}`));
    const receipt = buildQualificationReceipt(config);
    expect(receipt.tests).toHaveLength(15);
    expect(receipt.tests.every(test => test.status === 'BLOCKED')).toBe(true);
    expect(receipt.passed).toBe(false);
    expect(receipt.product_active).toBe(false);
  });

  it('rejects shared, production and non-8096 targets', () => {
    expect(() => validateQualificationConfig({ ...config, project: 'portal-research-preview' })).toThrow('P23_PROJECT_ISOLATION_REQUIRED');
    expect(() => validateQualificationConfig({ ...config, base_url: 'http://127.0.0.1:8095/' })).toThrow('P23_LOOPBACK_8096_REQUIRED');
    expect(() => validateQualificationConfig({ ...config, production: true })).toThrow('P23_SHARED_OR_PRODUCTION_TARGET_REFUSED');
  });

  it('never converts a failed resource receipt into a pass', () => {
    const receipt = buildQualificationReceipt(config, new Map(), { resource: { base_limit_bytes: 5_000_000_000, passed: false } });
    expect(receipt.passed).toBe(false);
    expect(receipt.tests.find(test => test.test_id === 'P23-T01')).toMatchObject({ status: 'BLOCKED', reason: 'P23_RESOURCE_RECEIPT_FAILED_OR_WRONG_LIMIT' });
  });
});
