import { CoverageRule, matrixCoverage } from './approval-coverage';

const rule = (overrides: Partial<CoverageRule>): CoverageRule => ({
  id: overrides.name ?? 'r',
  name: 'r',
  priority: 10,
  active: true,
  currency: 'QAR',
  minimumValue: null,
  maximumValue: null,
  projectId: null,
  category: null,
  ...overrides,
});

describe('Approval matrix coverage (Phase 3 SI-122)', () => {
  it('finds the seeded gap at exactly 500,000.00 and the values below the first band', () => {
    const [qar] = matrixCoverage([
      rule({ name: 'Up to 500k', minimumValue: '1.00', maximumValue: '500000.00' }),
      rule({ name: 'Above 500k', priority: 20, minimumValue: '500000.01' }),
    ]);
    expect(qar.currency).toBe('QAR');
    expect(qar.gaps).toEqual([
      { from: null, to: '1', rule: null },
      { from: '500000', to: '500000.01', rule: null },
    ]);
    expect(qar.bands.map((band) => band.rule)).toEqual([null, 'Up to 500k', null, 'Above 500k']);
    expect(qar.shadows).toEqual([]);
  });

  it('names the stretch where a rule never decides because one checked first covers it', () => {
    const [qar] = matrixCoverage([
      rule({ name: 'Everything', priority: 5 }),
      rule({ name: 'Large', priority: 10, minimumValue: '1000000' }),
    ]);
    expect(qar.gaps).toEqual([]);
    expect(qar.shadows).toEqual([{ rule: 'Large', by: 'Everything', from: '1000000', to: null }]);
  });

  it('applies a rule without a currency in every currency and leaves scoped and inactive rules out', () => {
    const coverage = matrixCoverage([
      rule({ name: 'Any currency', currency: null, priority: 50 }),
      rule({ name: 'QAR large', minimumValue: '100000' }),
      rule({ name: 'USD project', currency: 'USD', projectId: 'p1' }),
      rule({ name: 'Off', currency: 'SAR', active: false }),
    ]);
    expect(coverage.map((item) => item.currency)).toEqual(['QAR']);
    expect(coverage[0].gaps).toEqual([]);
    expect(coverage[0].bands.map((band) => band.rule)).toEqual(['Any currency', 'QAR large']);
  });

  it('compares exact decimals (no floating point)', () => {
    const [qar] = matrixCoverage([
      rule({ name: 'A', maximumValue: '0.1' }),
      rule({ name: 'B', minimumValue: '0.100', priority: 20 }),
    ]);
    expect(qar.gaps).toEqual([]);
  });
});
