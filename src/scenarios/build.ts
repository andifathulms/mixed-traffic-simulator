import type { Params, VehicleType, World } from '../sim/types';
import { createWorld, spawnVehicle } from '../sim/world';
import { createRng } from '../sim/rng';
import { equilibriumSpeed } from '../sim/idm';
import { DEFAULT_PARAMS, cloneParams } from '../sim/defaults';
import { composition } from '../sim/demand';
import type { Scenario } from './types';

export function scenarioParams(scenario: Scenario, overrides: Partial<Params> = {}): Params {
  return { ...cloneParams(DEFAULT_PARAMS), ...scenario.params, ...overrides };
}

/**
 * Build a world from a scenario and a seed.
 *
 * Ring scenarios are seeded at the analytic equilibrium: evenly spaced, all at
 * the speed that spacing sustains. Nothing is wrong at t = 0, which is exactly
 * the point — the jam has to come from somewhere, and it comes from the
 * per-vehicle parameter jitter and nothing else.
 */
export function buildWorld(scenario: Scenario, params: Params, seed: number): World {
  const rng = createRng(seed);
  const geometry = { ...scenario.geometry, reductions: [...scenario.geometry.reductions] };
  const signal = scenario.signal ? { ...scenario.signal } : null;
  const world = createWorld(geometry, rng, scenario.detectors.map((d) => ({ ...d })), signal);

  if (scenario.seedVehicles > 0) {
    seedRing(world, params, scenario.seedVehicles);
  }

  return world;
}

function seedRing(world: World, params: Params, count: number): void {
  const { geometry } = world;
  const shares = composition(params);
  const spacing = geometry.length / count;

  // Draw the type sequence deterministically from the shares, rather than
  // per-vehicle sampling, so a 60% motorcycle ring has exactly 60% motorcycles
  // and small-count scenarios are not at the mercy of the draw.
  const order: VehicleType[] = [];
  const types: VehicleType[] = ['MC', 'LV', 'HV', 'PU'];
  let assigned = 0;
  for (const t of types) {
    const n = Math.round(shares[t] * count);
    for (let i = 0; i < n && assigned < count; i++, assigned++) order.push(t);
  }
  while (order.length < count) order.push('LV');

  // Interleave rather than clustering by type, so the ring does not start with
  // all motorcycles bunched together.
  const interleaved: VehicleType[] = [];
  const buckets = new Map<VehicleType, VehicleType[]>();
  for (const t of order) {
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(t);
  }
  while (interleaved.length < count) {
    for (const [, bucket] of buckets) {
      const next = bucket.pop();
      if (next) interleaved.push(next);
      if (interleaved.length === count) break;
    }
  }

  for (let i = 0; i < count; i++) {
    const type = interleaved[i];
    const cfg = params.types[type];
    const gap = spacing - cfg.length;
    const v = equilibriumSpeed(Math.max(0.5, gap), cfg.idm);
    spawnVehicle(world, params, {
      type,
      x: i * spacing,
      y: geometry.width / 2,
      v,
    });
  }
}
