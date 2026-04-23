import { CostCalculator } from './cost-calculator';

describe('CostCalculator', () => {
  let calc: CostCalculator;

  beforeEach(() => {
    calc = new CostCalculator();
  });

  it('is defined', () => {
    expect(calc).toBeDefined();
  });

  it('computes cost formula: (N/1_000_000)*0.30 + (M/1_000_000)*2.50', () => {
    // 1M input tokens + 1M output tokens
    expect(calc.calc(1_000_000, 1_000_000)).toBeCloseTo(0.30 + 2.50, 5);
  });

  it('returns 0 for zero tokens', () => {
    expect(calc.calc(0, 0)).toBe(0);
  });

  it('computes small values correctly', () => {
    // 100 input tokens, 200 output tokens
    const expected = (100 / 1_000_000) * 0.30 + (200 / 1_000_000) * 2.50;
    expect(calc.calc(100, 200)).toBeCloseTo(expected, 10);
  });

  it('handles only input tokens', () => {
    const expected = (500_000 / 1_000_000) * 0.30;
    expect(calc.calc(500_000, 0)).toBeCloseTo(expected, 8);
  });

  it('handles only output tokens', () => {
    const expected = (500_000 / 1_000_000) * 2.50;
    expect(calc.calc(0, 500_000)).toBeCloseTo(expected, 8);
  });
});
