import { describe, it, expect } from 'vitest';
import { step } from '@/sim/world';
import { DT } from '@/sim/types';
import { phantomJam } from '@/scenarios/phantom-jam';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { equilibriumGap } from '@/sim/idm';
import { forwardDistance } from '@/sim/geometry';
import { WaveTracker, backwardWaveSpeed } from '@/sim/analysis';

function run(seconds: number, seed = phantomJam.seed) {
  const params = scenarioParams(phantomJam);
  const world = buildWorld(phantomJam, params, seed);
  const steps = Math.round(seconds / DT);
  const speedRange: number[] = [];
  const tracker = new WaveTracker();
  let jamTime: number | null = null;
  for (let i = 0; i < steps; i++) {
    step(world, DT, params);
    tracker.observe(world);
    if (i % 20 === 0) {
      const speeds = world.vehicles.map((v) => v.v);
      const range = Math.max(...speeds) - Math.min(...speeds);
      speedRange.push(range);
      if (jamTime === null && range > 3) jamTime = world.t;
    }
  }
  return { world, params, speedRange, tracker, jamTime };
}

describe('Sugiyama ring — the gate (PRD §6.2)', () => {
  it('starts every vehicle within tolerance of the analytic equilibrium', () => {
    const params = scenarioParams(phantomJam);
    const world = buildWorld(phantomJam, params, phantomJam.seed);
    expect(world.vehicles).toHaveLength(22);
    // Uniform at t = 0: nothing is wrong, which is the point of the scene.
    const speeds = world.vehicles.map((v) => v.v);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeCloseTo(0, 10);

    // Every vehicle is seeded at the speed the uniform spacing sustains under
    // the scenario's nominal parameters. Each vehicle's own parameters are
    // jittered around those, so at t = 0 each one is fractionally off its own
    // equilibrium — that jitter is the entire perturbation, and it is what the
    // jam grows from.
    const spacing = 230 / 22;
    const nominal = params.types.LV.idm;
    for (const v of world.vehicles) {
      expect(equilibriumGap(v.v, nominal)).toBeCloseTo(spacing - v.length, 4);
    }
  });

  it('forms a jam spontaneously — speed spread grows from nothing', () => {
    const { speedRange } = run(300);

    // At t = 0 the ring is uniform: every vehicle at the same speed.
    expect(speedRange[0]).toBeLessThan(0.6);

    // Within five minutes the spread must be large — some vehicles near a stop
    // while others run near free speed. That is a jam, not a fluctuation.
    const peak = Math.max(...speedRange);
    expect(peak).toBeGreaterThan(4);
  });

  it('forms the jam within the published time range', () => {
    // Sugiyama reports a jam appearing within a couple of minutes. This asserts
    // that band rather than an exact time, because the exact time depends on
    // the seed and the published experiment varied between runs too.
    const { jamTime } = run(300);
    expect(jamTime).not.toBeNull();
    expect(jamTime!).toBeGreaterThan(20);
    expect(jamTime!).toBeLessThan(200);
  });

  it('propagates the jam backward against the flow', () => {
    const { world, tracker } = run(600);
    // Skip the formation transient; measure the established wave.
    const wave = backwardWaveSpeed(tracker.events, world.geometry, 200);
    expect(wave).not.toBeNull();
    // Backward, and in the range field studies report for stop-and-go waves.
    expect(wave!).toBeLessThan(0);
    expect(Math.abs(wave!)).toBeGreaterThan(5);
    expect(Math.abs(wave!)).toBeLessThan(35);
  });

  it('brings at least one vehicle close to a standstill', () => {
    const { world } = run(400);
    const slowest = Math.min(...world.vehicles.map((v) => v.v));
    expect(slowest).toBeLessThan(1.5);
  });

  it('conserves vehicles exactly on a closed ring (PRD §6.4)', () => {
    const { world } = run(300);
    expect(world.vehicles).toHaveLength(22);
    expect(world.departed).toBe(0);
  });

  it('never overlaps vehicles (PRD §6.5)', () => {
    const { world } = run(400);
    expect(world.warnings.filter((w) => w.kind === 'overlap')).toHaveLength(0);

    const sorted = [...world.vehicles].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      const separation = forwardDistance(a.x, b.x, world.geometry);
      expect(separation).toBeGreaterThan((a.length + b.length) / 2 - 0.05);
    }
  });

  it('never produces a negative speed or a non-finite state', () => {
    const { world } = run(400);
    for (const v of world.vehicles) {
      expect(v.v).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.v)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
    }
    expect(world.warnings.filter((w) => w.kind === 'nan')).toHaveLength(0);
  });

  it('is bit-identical across two runs from the same seed (PRD §6.6)', () => {
    const a = run(100);
    const b = run(100);
    const trace = (r: ReturnType<typeof run>) =>
      r.world.vehicles.map((v) => `${v.id}:${v.x}:${v.v}:${v.y}`).join('|');
    expect(trace(a)).toBe(trace(b));
  });

  it('diverges from a different seed', () => {
    const a = run(100, 1);
    const b = run(100, 2);
    const trace = (r: ReturnType<typeof run>) => r.world.vehicles.map((v) => v.x).join('|');
    expect(trace(a)).not.toBe(trace(b));
  });
});
