import { describe, it, expect } from 'vitest';
import { idmAcceleration, equilibriumGap, equilibriumSpeed, MAX_DECELERATION } from '@/sim/idm';
import { DEFAULT_TYPES } from '@/sim/defaults';
import { forwardDistance, gapTo, widthAt } from '@/sim/geometry';
import type { Geometry, Vehicle } from '@/sim/types';

const LV = DEFAULT_TYPES.LV.idm;

describe('IDM', () => {
  it('accelerates toward desired speed on an empty road', () => {
    const { a, interaction } = idmAcceleration(0, 0, Infinity, LV);
    expect(a).toBeCloseTo(LV.a, 10);
    expect(interaction).toBe(0);
  });

  it('produces zero acceleration at the desired speed with no leader', () => {
    const { a } = idmAcceleration(LV.v0, 0, Infinity, LV);
    expect(a).toBeCloseTo(0, 12);
  });

  // PRD §6.1 — the exact test. No judgement involved.
  it('has zero acceleration at exactly the closed-form equilibrium gap', () => {
    for (const v of [2, 5, 8, 11, 14]) {
      const s = equilibriumGap(v, LV);
      const { a } = idmAcceleration(v, 0, s, LV);
      expect(Math.abs(a)).toBeLessThan(1e-12);
    }
  });

  it('inverts the equilibrium relation to floating-point tolerance', () => {
    for (const v of [3, 6, 9, 12]) {
      const s = equilibriumGap(v, LV);
      expect(equilibriumSpeed(s, LV)).toBeCloseTo(v, 8);
    }
  });

  it('clamps emergency braking at 8 m/s² rather than diverging', () => {
    const { a, clamped } = idmAcceleration(20, 20, 0.01, LV);
    expect(a).toBe(-MAX_DECELERATION);
    expect(clamped).toBe(true);
  });

  it('never returns NaN at a zero or negative gap', () => {
    for (const s of [0, -0.5, -5]) {
      const { a } = idmAcceleration(10, 4, s, LV);
      expect(Number.isFinite(a)).toBe(true);
    }
  });

  it('brakes harder as the approach rate rises', () => {
    const slow = idmAcceleration(10, 0, 20, LV).a;
    const fast = idmAcceleration(10, 6, 20, LV).a;
    expect(fast).toBeLessThan(slow);
  });
});

describe('geometry', () => {
  const ring: Geometry = {
    length: 230, width: 3.5, ring: true, markings: false,
    laneCount: 1, reductions: [], gradient: 0,
  };
  const open: Geometry = { ...ring, ring: false, length: 1000 };

  it('wraps forward distance on a ring', () => {
    expect(forwardDistance(220, 10, ring)).toBeCloseTo(20, 10);
    expect(forwardDistance(10, 220, ring)).toBeCloseTo(210, 10);
  });

  it('does not wrap on an open corridor', () => {
    expect(forwardDistance(900, 100, open)).toBeCloseTo(-800, 10);
  });

  it('removes both half-lengths from the bumper-to-bumper gap', () => {
    const mk = (x: number, length: number): Vehicle =>
      ({ x, length } as Vehicle);
    expect(gapTo(mk(100, 4.4), mk(90, 4.4), ring)).toBeCloseTo(10 - 4.4, 10);
  });

  it('narrows the carriageway inside a width reduction and restores it outside', () => {
    const wide: Geometry = { ...open, width: 7 };
    const g: Geometry = { ...wide, reductions: [{ at: 500, span: 120, severity: 3 }] };
    expect(widthAt(500, g)).toBeCloseTo(7 - 3, 6);
    expect(widthAt(0, g)).toBeCloseTo(7, 10);
    expect(widthAt(555, g)).toBeGreaterThan(widthAt(500, g));
  });

  it('never narrows below a floor a vehicle could not pass', () => {
    const g: Geometry = { ...open, reductions: [{ at: 500, span: 100, severity: 99 }] };
    expect(widthAt(500, g)).toBe(1.5);
  });
});
