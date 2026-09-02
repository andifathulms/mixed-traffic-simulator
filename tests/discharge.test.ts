import { describe, it, expect } from 'vitest';
import { step } from '@/sim/world';
import { DT } from '@/sim/types';
import { signalised } from '@/scenarios';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { DischargeRecorder, saturationHeadway, saturationFlow } from '@/sim/discharge';
import { inRhkBox } from '@/sim/signal';

function runSignal(rhk: boolean, seconds = 900, mcFraction = 0.6) {
  const params = scenarioParams(signalised, { mcFraction });
  const scenario = {
    ...signalised,
    signal: { ...signalised.signal!, rhk },
  };
  const world = buildWorld(scenario, params, signalised.seed);
  const recorder = new DischargeRecorder();
  let maxInBox = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(world, DT, params);
    recorder.observe(world, DT);
    if (world.signal!.aspect === 'red') {
      const inBox = world.vehicles.filter((v) => inRhkBox(v, world.signal!, world));
      maxInBox = Math.max(maxInBox, inBox.length);
    }
  }
  return { world, recorder, maxInBox };
}

describe('discharge at the stop line', () => {
  const without = runSignal(false);

  it('records discharging vehicles across many cycles', () => {
    expect(without.recorder.records.length).toBeGreaterThan(30);
    expect(new Set(without.recorder.records.map((r) => r.cycleIndex)).size).toBeGreaterThan(3);
  });

  it('never records a headway for the first vehicle away', () => {
    // It has no predecessor in the cycle, and a zero would drag the
    // saturation estimate down.
    expect(without.recorder.records.every((r) => r.queuePosition >= 2)).toBe(true);
    expect(without.recorder.records.every((r) => r.headway > 0)).toBe(true);
  });

  it('reports a saturation headway in a plausible range', () => {
    const sat = saturationHeadway(without.recorder.records);
    expect(sat).not.toBeNull();
    // Field saturation headways sit around 1.9 to 2.4 s for cars; a
    // motorcycle-heavy stream discharges faster.
    expect(sat!.headway).toBeGreaterThan(0.2);
    expect(sat!.headway).toBeLessThan(4);
    expect(saturationFlow(sat!.headway)).toBeGreaterThan(900);
  });

  it('discharges later queue positions more evenly than the first few', () => {
    // The first vehicles are still accelerating from rest, which is why the
    // saturation measurement starts at position five.
    const early = without.recorder.records.filter((r) => r.queuePosition <= 3);
    const late = without.recorder.records.filter((r) => r.queuePosition >= 6);
    expect(early.length).toBeGreaterThan(3);
    expect(late.length).toBeGreaterThan(3);
    const spread = (xs: typeof early) => {
      const m = xs.reduce((s, r) => s + r.headway, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, r) => s + (r.headway - m) ** 2, 0) / xs.length);
    };
    expect(spread(late)).toBeLessThan(spread(early) * 1.6);
  });
});

describe('Ruang Henti Khusus', () => {
  it('gathers motorcycles inside the painted box on red', () => {
    const withRhk = runSignal(true);
    expect(withRhk.maxInBox).toBeGreaterThan(2);
  });

  it('measures discharge with and without the box so they can be compared', () => {
    const withRhk = runSignal(true);
    const withoutRhk = runSignal(false);

    const a = saturationHeadway(withRhk.recorder.records, true);
    const b = saturationHeadway(withoutRhk.recorder.records, false);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    // The app does not declare a recommendation about RHK (PRD §7.5). It
    // measures both conditions and shows them. The test asserts that both are
    // measurable and distinguishable, not which one wins.
    expect(a!.headway).not.toBe(b!.headway);
  });

  it('puts motorcycles at the front of the queue when the box is enabled', () => {
    const withRhk = runSignal(true);
    const early = withRhk.recorder.records.filter((r) => r.queuePosition <= 4);
    const mcShare = early.filter((r) => r.type === 'MC').length / early.length;
    expect(early.length).toBeGreaterThan(5);
    // With an advance stop line, motorcycles lead the discharge.
    expect(mcShare).toBeGreaterThan(0.5);
  });
});
