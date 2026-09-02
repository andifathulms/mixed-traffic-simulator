import type { Params, VehicleType, World } from './types';
import { spawnVehicle } from './world';
import { findLeader, SpatialIndex } from './neighbours';
import { leftEdgeAt, rightEdgeAt } from './geometry';

/** Composition shares from the motorcycle fraction and the remainder splits. */
export function composition(params: Params): Record<VehicleType, number> {
  const mc = Math.max(0, Math.min(0.95, params.mcFraction));
  const rest = 1 - mc;
  const hv = rest * params.hvShare;
  const pu = rest * params.puShare;
  const lv = rest - hv - pu;
  return { MC: mc, LV: Math.max(0, lv), HV: hv, PU: pu };
}

const entryIndex = new SpatialIndex();

/**
 * Admit arrivals at the upstream boundary.
 *
 * Arrival credit accumulates fractionally per type so a 1800 veh/h demand at a
 * 0.05 s step produces the right count over an hour rather than rounding to
 * zero every step. The process shapes *when* within that budget vehicles arrive.
 */
export function admitArrivals(world: World, dt: number, params: Params): void {
  const shares = composition(params);
  const perSecond = params.inflow / 3600;

  entryIndex.rebuild(world.vehicles, world.geometry);

  for (const type of ['MC', 'LV', 'HV', 'PU'] as VehicleType[]) {
    const rate = perSecond * shares[type];
    if (rate <= 0) continue;

    let credit = world.arrivalCredit[type];

    switch (params.arrival) {
      case 'uniform':
        credit += rate * dt;
        break;
      case 'platooned':
        // Platoons: demand arrives in bursts separated by gaps, on a slow
        // sinusoid. Mean rate is preserved; the variance is the point.
        credit += rate * dt * (1 + 0.9 * Math.sin(world.t * 0.06 + type.charCodeAt(0)));
        break;
      case 'poisson':
      default: {
        // Bernoulli per step with probability rate·dt is Poisson in the limit,
        // and it draws exactly one random number per type per step, which keeps
        // the RNG stream stable under any inflow value.
        if (world.rng.next() < rate * dt) credit += 1;
        break;
      }
    }

    while (credit >= 1) {
      if (tryAdmit(world, params, type)) {
        credit -= 1;
      } else {
        // The entry is blocked. Demand that cannot be served is counted, not
        // silently dropped — an unserved count is how you tell a capacity
        // result from a demand result.
        world.unserved++;
        credit -= 1;
      }
    }

    world.arrivalCredit[type] = credit;
  }
}

/** Place a vehicle at the upstream boundary if there is room at some offset. */
function tryAdmit(world: World, params: Params, type: VehicleType): boolean {
  const cfg = params.types[type];
  const { geometry } = world;
  const x = cfg.length / 2;

  const left = leftEdgeAt(0, geometry) + cfg.width / 2;
  const right = rightEdgeAt(0, geometry) - cfg.width / 2;
  if (right <= left) return false;

  // Try several lateral offsets, widest gap first. A motorcycle can enter
  // where a car cannot, which is part of why the two are not interchangeable.
  const attempts = 7;
  const spacing = (right - left) / (attempts - 1);
  let bestY = left;
  let bestGap = -Infinity;

  const probe = {
    id: -1,
    x,
    y: left,
    v: 0,
    width: cfg.width,
    length: cfg.length,
  } as Parameters<typeof findLeader>[0];

  for (let i = 0; i < attempts; i++) {
    const y = left + spacing * i;
    probe.y = y;
    const { gap } = findLeader(probe, entryIndex, geometry, params, y);
    if (gap > bestGap) {
      bestGap = gap;
      bestY = y;
    }
  }

  // Require the minimum gap plus a margin, so an admitted vehicle is never
  // spawned already braking or already overlapping.
  if (bestGap < cfg.idm.s0 + 2) return false;

  const entrySpeed = Math.min(cfg.idm.v0, Math.sqrt(2 * cfg.idm.a * Math.max(0, bestGap)));
  spawnVehicle(world, params, { type, x, y: bestY, v: entrySpeed });
  return true;
}
