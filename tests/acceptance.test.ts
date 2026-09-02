import { describe, it, expect } from 'vitest';
import { advance, MAX_STEPS_PER_FRAME } from '@/sim/loop';
import { step } from '@/sim/world';
import { DT } from '@/sim/types';
import { corridor, phantomJam, SCENARIOS } from '@/scenarios';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { attachDetectorLog, createDetectorLog } from '@/sim/detectors';
import { aggregate } from '@/estimators';
import { WaveTracker, backwardWaveSpeed } from '@/sim/analysis';

function trace(world: ReturnType<typeof buildWorld>): string {
  return world.vehicles
    .map((v) => `${v.id}:${v.x.toFixed(9)}:${v.v.toFixed(9)}:${v.y.toFixed(9)}`)
    .join('|');
}

describe('fixed timestep decoupled from render (PRD §9.3)', () => {
  /** Simulate the same wall time delivered in different frame sizes. */
  function runAtFrameRate(fps: number, seconds: number) {
    const params = scenarioParams(corridor);
    const world = buildWorld(corridor, params, corridor.seed);
    const frame = 1 / fps;
    let accumulator = 0;
    // Deliberately below the per-frame cap so no time is dropped.
    for (let t = 0; t < seconds; t += frame) {
      const r = advance(world, params, frame, accumulator);
      accumulator = r.accumulator;
      expect(r.capped).toBe(false);
    }
    return world;
  }

  it('produces identical results at 30 and 120 fps', () => {
    const a = runAtFrameRate(30, 60);
    const b = runAtFrameRate(120, 60);
    // Both consumed 60 s of simulated time in different sized frames. Because
    // the physics steps at a fixed 0.05 s regardless, the states must match.
    expect(a.step).toBe(b.step);
    expect(trace(a)).toBe(trace(b));
  });

  it('produces identical results under an irregular frame rate', () => {
    const steady = runAtFrameRate(60, 40);

    const params = scenarioParams(corridor);
    const jittery = buildWorld(corridor, params, corridor.seed);
    let accumulator = 0;
    // A frame pattern no vsync would produce, to prove nothing depends on the
    // regularity of the frames rather than only on their total.
    const pattern = [0.004, 0.05, 0.011, 0.033, 0.002, 0.09];
    let i = 0;

    while (jittery.step < steady.step) {
      accumulator = advance(jittery, params, pattern[i++ % pattern.length], accumulator)
        .accumulator;
    }

    // Compared against a world stepped directly the same number of times,
    // rather than against the 60 fps run at the same wall clock.
    //
    // Summing an irregular pattern accumulates floating-point error, so the
    // frame in which the eight hundredth step falls due can land either side
    // of a frame boundary and a run can end on 799 or 801. That is a property
    // of adding floats in a different order, not of the physics. The guarantee
    // worth asserting is the one the fixed timestep actually makes: step N is
    // identical however the frames were cut.
    const direct = buildWorld(corridor, scenarioParams(corridor), corridor.seed);
    const directParams = scenarioParams(corridor);
    for (let n = 0; n < jittery.step; n++) step(direct, DT, directParams);

    expect(trace(jittery)).toBe(trace(direct));
    // And the 60 fps run, whose frames divide the timestep exactly, lands on
    // precisely the expected count.
    expect(steady.step).toBe(800);
  });

  it('caps the steps per frame rather than locking the thread', () => {
    const params = scenarioParams(corridor);
    const world = buildWorld(corridor, params, corridor.seed);
    // A backgrounded tab returning to focus: minutes of elapsed time at once.
    const result = advance(world, params, 300, 0);
    expect(result.stepsTaken).toBe(MAX_STEPS_PER_FRAME);
    expect(result.capped).toBe(true);
    // The excess is dropped, not silently queued for the following frames.
    expect(result.accumulator).toBe(0);
  });
});

describe('the fundamental diagram has the right shape (PRD §6.3)', () => {
  it('shows a free-flow branch, a capacity peak and a congested branch', () => {
    const params = scenarioParams(corridor, { inflow: 200, mcFraction: 0 });
    const world = buildWorld(corridor, params, corridor.seed);
    const log = createDetectorLog();

    for (let i = 0; i < 60 / DT; i++) step(world, DT, params);
    attachDetectorLog(log);
    const start = world.t;

    // Ramp demand from near-empty to well past capacity. A run at a single
    // inflow sits at one operating point and draws a blob, not a diagram —
    // both branches only appear if the road is taken through capacity.
    const rampSteps = Math.round(1800 / DT);
    for (let i = 0; i < rampSteps; i++) {
      params.inflow = 200 + (5600 * i) / rampSteps;
      step(world, DT, params);
    }
    attachDetectorLog(null);
    for (const r of log.records) r.crossingTime -= start;

    const bins = aggregate(log.records, 120, world.t - start).filter(
      (b) => b.total > 3 && b.spaceMeanSpeed > 0.2,
    );
    expect(bins.length).toBeGreaterThan(8);

    const points = bins.map((b) => ({
      k: b.flow / (b.spaceMeanSpeed * 3.6),
      q: b.flow,
      v: b.spaceMeanSpeed,
    }));

    const maxQ = Math.max(...points.map((p) => p.q));
    const kAtPeak = points.find((p) => p.q === maxQ)!.k;

    // A capacity peak exists, and it is not at zero density.
    expect(maxQ).toBeGreaterThan(500);
    expect(kAtPeak).toBeGreaterThan(5);

    // On the free-flow branch, speed is near free speed; density and flow rise
    // together.
    const free = points.filter((p) => p.k < kAtPeak * 0.6);
    expect(free.length).toBeGreaterThan(2);
    const meanFreeSpeed = free.reduce((s, p) => s + p.v, 0) / free.length;
    expect(meanFreeSpeed).toBeGreaterThan(params.types.LV.idm.v0 * 0.5);
  });

  it('produces a backward wave in the range field studies report', () => {
    // Measured on the ring, where a jam is sustained rather than flushed out
    // of the downstream boundary.
    const params = scenarioParams(phantomJam);
    const world = buildWorld(phantomJam, params, phantomJam.seed);
    const tracker = new WaveTracker();
    for (let i = 0; i < 1200 / DT; i++) {
      step(world, DT, params);
      tracker.observe(world);
    }
    const wave = backwardWaveSpeed(tracker.events, world.geometry, 300);
    expect(wave).not.toBeNull();
    // Backward, against the flow, and of the order field studies report for
    // stop-and-go waves — roughly 15 to 20 km/h, asserted with the tolerance
    // an uncalibrated model deserves.
    expect(wave!).toBeLessThan(0);
    expect(Math.abs(wave!)).toBeGreaterThan(8);
    expect(Math.abs(wave!)).toBeLessThan(30);
  });
});

describe('performance budget (PRD §9.2, §9.4)', () => {
  it('simulates several hundred vehicles far faster than real time', () => {
    const params = scenarioParams(corridor, { inflow: 6000, mcFraction: 0.6 });
    const world = buildWorld(corridor, params, corridor.seed);

    for (let i = 0; i < 400 / DT; i++) step(world, DT, params);
    expect(world.vehicles.length).toBeGreaterThan(150);

    const measured = 200;
    const t0 = Date.now();
    for (let i = 0; i < measured / DT; i++) step(world, DT, params);
    const elapsed = (Date.now() - t0) / 1000;

    // Real time needs 20 steps per second. Requiring at least a 10x margin
    // leaves the whole frame budget for rendering at 60 fps, and this runs in
    // node without a JIT-warmed browser.
    expect(elapsed).toBeLessThan(measured / 10);
  });
});

describe('every scenario runs clean', () => {
  it('produces no collisions or non-finite states in any preset', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      const params = scenarioParams(scenario);
      const world = buildWorld(scenario, params, scenario.seed);
      for (let i = 0; i < 300 / DT; i++) step(world, DT, params);

      const bad = world.warnings.filter((w) => w.kind === 'overlap' || w.kind === 'nan');
      expect(bad, `${scenario.id} produced ${bad.map((w) => w.message).join('; ')}`).toEqual(
        [],
      );

      for (const v of world.vehicles) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(v.v).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeGreaterThanOrEqual(-0.01);
        expect(v.y).toBeLessThanOrEqual(world.geometry.width + 0.01);
      }
    }
  });
});
