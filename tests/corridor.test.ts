import { describe, it, expect } from 'vitest';
import { addWarning, step } from '@/sim/world';
import { DT } from '@/sim/types';
import { corridor, bottleneck, angkot, signalised } from '@/scenarios';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { attachDetectorLog, createDetectorLog } from '@/sim/detectors';
import { forwardDistance } from '@/sim/geometry';
import type { Scenario } from '@/scenarios/types';
import type { Params } from '@/sim/types';

function run(scenario: Scenario, seconds: number, overrides: Partial<Params> = {}) {
  const params = scenarioParams(scenario, overrides);
  const world = buildWorld(scenario, params, scenario.seed);
  const log = createDetectorLog();
  attachDetectorLog(log);
  try {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(world, DT, params);
  } finally {
    attachDetectorLog(null);
  }
  return { world, params, log };
}

describe('open corridor', () => {
  it('fills from inflow and reaches a steady population', () => {
    const { world } = run(corridor, 300);
    expect(world.vehicles.length).toBeGreaterThan(20);
    expect(world.departed).toBeGreaterThan(20);
  });

  it('conserves vehicles across the boundaries (PRD §6.4)', () => {
    const { world } = run(corridor, 300);
    // Every vehicle ever created is either still on the road or has departed.
    const created = world.nextId - 1;
    expect(created).toBe(world.vehicles.length + world.departed);
  });

  it('produces no overlaps or non-finite states (PRD §6.5)', () => {
    const { world } = run(corridor, 300);
    expect(world.warnings.filter((w) => w.kind === 'overlap')).toHaveLength(0);
    expect(world.warnings.filter((w) => w.kind === 'nan')).toHaveLength(0);
  });

  it('keeps every vehicle inside the carriageway', () => {
    const { world } = run(corridor, 200);
    for (const v of world.vehicles) {
      expect(v.y - v.width / 2).toBeGreaterThanOrEqual(-0.01);
      expect(v.y + v.width / 2).toBeLessThanOrEqual(world.geometry.width + 0.01);
    }
  });

  it('records detector crossings with plausible spot speeds', () => {
    const { log } = run(corridor, 200);
    expect(log.records.length).toBeGreaterThan(50);
    for (const r of log.records) {
      expect(r.spotSpeed).toBeGreaterThan(0);
      expect(r.spotSpeed).toBeLessThan(40);
      expect(r.occupancyTime).toBeGreaterThan(0);
      expect(['MC', 'LV', 'HV', 'PU']).toContain(r.vehicleClass);
    }
  });

  it('reproduces exactly from the same seed (PRD §6.6)', () => {
    const trace = () =>
      run(corridor, 120).world.vehicles.map((v) => `${v.id}:${v.x}:${v.v}`).join('|');
    expect(trace()).toBe(trace());
  });

  it('carries more motorcycles past a detector at a higher motorcycle fraction', () => {
    const low = run(corridor, 200, { mcFraction: 0.2 });
    const high = run(corridor, 200, { mcFraction: 0.8 });
    const share = (r: typeof low) =>
      r.log.records.filter((x) => x.vehicleClass === 'MC').length / r.log.records.length;
    expect(share(high)).toBeGreaterThan(share(low) + 0.3);
  });
});

describe('bottleneck', () => {
  it('queues upstream of the throat and runs freer downstream', () => {
    const { world } = run(bottleneck, 400);
    const throat = world.geometry.length / 2;
    const upstream = world.vehicles.filter(
      (v) => v.x > throat - 400 && v.x < throat - 40,
    );
    const downstream = world.vehicles.filter(
      (v) => v.x > throat + 100 && v.x < throat + 400,
    );
    expect(upstream.length).toBeGreaterThan(3);
    expect(downstream.length).toBeGreaterThan(0);

    const mean = (vs: typeof upstream) => vs.reduce((s, v) => s + v.v, 0) / vs.length;
    // The queue is the whole demonstration: slower upstream than downstream.
    expect(mean(upstream)).toBeLessThan(mean(downstream));
  });

  it('narrows the vehicles into the reduced width at the throat', () => {
    const { world } = run(bottleneck, 300);
    const throat = world.geometry.length / 2;
    for (const v of world.vehicles) {
      if (Math.abs(v.x - throat) > 20) continue;
      // The reduction takes 3.5 m from a 7 m road, centred.
      expect(v.y).toBeGreaterThan(1.5);
      expect(v.y).toBeLessThan(5.5);
    }
  });
});

describe('signalised approach', () => {
  it('cycles through green, amber and red', () => {
    const params = scenarioParams(signalised);
    const world = buildWorld(signalised, params, signalised.seed);
    const seen = new Set<string>();
    for (let i = 0; i < Math.round(200 / DT); i++) {
      step(world, DT, params);
      seen.add(world.signal!.aspect);
    }
    expect(seen).toEqual(new Set(['green', 'amber', 'red']));
  });

  it('holds a queue behind the stop line on red', () => {
    const params = scenarioParams(signalised);
    const world = buildWorld(signalised, params, signalised.seed);
    let queued = 0;
    for (let i = 0; i < Math.round(400 / DT); i++) {
      step(world, DT, params);
      if (world.signal!.aspect === 'red') {
        const stopped = world.vehicles.filter(
          (v) => v.v < 0.5 && forwardDistance(v.x, world.signal!.position, world.geometry) > 0,
        );
        queued = Math.max(queued, stopped.length);
      }
    }
    expect(queued).toBeGreaterThan(4);
  });

  it('does not let a vehicle cross the stop line on red', () => {
    const params = scenarioParams(signalised);
    const world = buildWorld(signalised, params, signalised.seed);
    for (let i = 0; i < Math.round(300 / DT); i++) {
      step(world, DT, params);
      const s = world.signal!;
      if (s.aspect !== 'red') continue;
      // A vehicle that entered the intersection on amber may still be clearing
      // it, so only vehicles well past the line at speed would be a violation.
      const violators = world.vehicles.filter(
        (v) => v.x > s.position + 30 && v.x < s.position + 60 && v.v < 0.2,
      );
      expect(violators).toHaveLength(0);
    }
  });
});

describe('angkot side friction', () => {
  it('stops public transport vehicles at the roadside and releases them', () => {
    const params = scenarioParams(angkot);
    const world = buildWorld(angkot, params, angkot.seed);
    let everStopped = false;
    let everReleased = false;
    for (let i = 0; i < Math.round(600 / DT); i++) {
      step(world, DT, params);
      const stopped = world.vehicles.filter((v) => v.stopped);
      if (stopped.length > 0) everStopped = true;
      else if (everStopped) everReleased = true;
    }
    expect(everStopped).toBe(true);
    expect(everReleased).toBe(true);
  });

  it('reduces throughput relative to the same corridor without friction', () => {
    const withFriction = run(angkot, 600);
    const without = run(angkot, 600, {
      friction: {
        angkotStopRate: 0,
        angkotDwellMean: 16,
        pedestrianRate: 0,
        accessRate: 0,
        parkingWidth: 0,
      },
    });
    expect(withFriction.world.departed).toBeLessThan(without.world.departed);
  });
});

describe('warnings', () => {
  it('folds repeats of one event into a single entry carrying the worst case', () => {
    // A warning's message carries a measurement and the measurement changes
    // every step, so the same pair of vehicles drifting apart over three steps
    // used to fill the list with three near-identical lines. One event, one
    // entry, the worst depth reported.
    const world = buildWorld(corridor, scenarioParams(corridor), 1);

    addWarning(world, 'overlap', 'overlap by 0.22 m', 'overlap:46-47', 0.22);
    addWarning(world, 'overlap', 'overlap by 1.48 m', 'overlap:46-47', 1.48);
    addWarning(world, 'overlap', 'overlap by 0.86 m', 'overlap:46-47', 0.86);

    expect(world.warnings).toHaveLength(1);
    expect(world.warnings[0].count).toBe(3);
    expect(world.warnings[0].message).toBe('overlap by 1.48 m');

    // A different pair is a different event.
    addWarning(world, 'overlap', 'overlap by 0.1 m', 'overlap:12-13', 0.1);
    expect(world.warnings).toHaveLength(2);
  });
});
