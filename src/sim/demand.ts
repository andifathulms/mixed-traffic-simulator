import type { Params, VehicleType, World } from './types';
import { spawnVehicle } from './world';
import { findLeader, findFollower, SpatialIndex } from './neighbours';
import { leftEdgeAt, rightEdgeAt } from './geometry';
import { blockedWidthAt } from './friction';

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
  // Rebuilt per admission rather than once per step. Several vehicles can be
  // admitted in a single step — one per type, and more when arrival credit has
  // accumulated — and an index built before any of them were placed does not
  // contain them, so the second vehicle of a step could be admitted straight
  // on top of the first. Admissions are rare enough that rebuilding is cheap.
  entryIndex.rebuild(world.vehicles, world.geometry);

  const cfg = params.types[type];
  const { geometry } = world;
  const x = cfg.length / 2;

  // The usable width at the entry, computed the same way the road computes it
  // everywhere else — roadside blockage included.
  //
  // It used to use the kerb-to-kerb width. A stopping angkot or a strip of
  // roadside parking narrows the entry like anywhere else, but the gate could
  // not see it, so it admitted vehicles into the occupied strip and left the
  // lateral resolver to sort out an overlap it had no room to sort out. Every
  // deep overlap in the angkot scenario was one of these, all of them within
  // a few metres of x = 0.
  const blocked = blockedWidthAt(x, world, params);
  const left = leftEdgeAt(x, geometry) + cfg.width / 2;
  const right = rightEdgeAt(x, geometry) - blocked - cfg.width / 2;

  // Too narrow for this vehicle at any offset: the entry is blocked, which is
  // an unserved arrival rather than a vehicle squeezed in sideways.
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

    // Both directions, not just ahead.
    //
    // Vehicles enter at their own half-length, so a long vehicle's spawn point
    // sits further down the road than a short one's. A bus admitted behind a
    // car that entered moments earlier would find nothing ahead of it, be
    // waved through, and materialise on top of the car — which is exactly what
    // produced every deep overlap in the corridor, all of them within a
    // quarter second of entry and none of them at the bottleneck they were
    // blamed on.
    const ahead = findLeader(probe, entryIndex, geometry, params, y);
    const behind = findFollower(probe, entryIndex, geometry, params, y);
    const gap = Math.min(ahead.gap, behind.gap);
    if (gap > bestGap) {
      bestGap = gap;
      bestY = y;
    }
  }

  // Require the minimum gap plus a margin, so an admitted vehicle is never
  // spawned already braking or already overlapping.
  if (bestGap < cfg.idm.s0 + 2) return false;

  // Entry speed is set by the room ahead, not by the tighter of the two gaps —
  // a vehicle close behind does not require the newcomer to enter slowly.
  probe.y = bestY;
  const room = findLeader(probe, entryIndex, geometry, params, bestY).gap;
  const entrySpeed = Math.min(
    cfg.idm.v0,
    Math.sqrt(2 * cfg.idm.a * Math.max(0, Number.isFinite(room) ? room : cfg.idm.v0 ** 2)),
  );
  spawnVehicle(world, params, { type, x, y: bestY, v: entrySpeed });
  return true;
}
