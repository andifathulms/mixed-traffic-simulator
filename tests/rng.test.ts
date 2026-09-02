import { describe, it, expect } from 'vitest';
import { createRng, seedFromString } from '@/sim/rng';

describe('seeded PRNG', () => {
  it('reproduces an identical stream from an identical seed', () => {
    const a = createRng(4471);
    const b = createRng(4471);
    const xs = Array.from({ length: 500 }, () => a.next());
    const ys = Array.from({ length: 500 }, () => b.next());
    expect(xs).toEqual(ys);
  });

  it('produces different streams from different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 20000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('has an approximately uniform mean', () => {
    const r = createRng(99);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });

  it('draws normals with the requested mean and spread', () => {
    const r = createRng(23);
    const n = 100000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.normal(10, 2);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(sumSq / n - mean * mean)).toBeCloseTo(2, 1);
  });

  it('draws exponentials with the requested mean and never returns a negative', () => {
    const r = createRng(31);
    const n = 100000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = r.exponential(3);
      expect(x).toBeGreaterThanOrEqual(0);
      sum += x;
    }
    expect(sum / n).toBeCloseTo(3, 1);
  });

  it('restores an exact stream position from a saved state', () => {
    const r = createRng(555);
    for (let i = 0; i < 50; i++) r.next();
    const saved = r.getState();
    const expected = Array.from({ length: 20 }, () => r.next());
    r.setState(saved);
    expect(Array.from({ length: 20 }, () => r.next())).toEqual(expected);
  });

  it('derives a stable seed from a string', () => {
    expect(seedFromString('phantom-jam')).toBe(seedFromString('phantom-jam'));
    expect(seedFromString('phantom-jam')).not.toBe(seedFromString('corridor'));
  });
});
