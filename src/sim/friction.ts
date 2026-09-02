import type { FrictionEvent, Params, World } from './types';
import { forwardDistance } from './geometry';

/**
 * Side friction as events rather than a coefficient.
 *
 * MKJI 1997 treats hambatan samping as a multiplicative capacity reduction
 * derived from counted roadside events. This module simulates the events
 * themselves, so the user can watch a single stopping angkot seed a wave that
 * propagates back a kilometre — which is the mechanism the factor abstracts
 * away (PRD §4.5).
 */

const HOUR = 3600;

export function applyFriction(world: World, dt: number, params: Params): void {
  const f = params.friction;
  const { geometry } = world;

  scheduleEvents(world, dt, params);

  for (const e of world.events) {
    if (e.done) continue;
    if (world.t < e.at) continue;
    if (world.t > e.at + e.duration) {
      e.active = false;
      e.done = true;
      continue;
    }
    e.active = true;
  }

  // Drop finished events so the list does not grow across a long run.
  if (world.events.length > 200) {
    world.events = world.events.filter((e) => !e.done);
  }

  // An angkot near an active stop event pulls over and dwells.
  for (const v of world.vehicles) {
    if (v.stopped) {
      if (world.t >= v.stoppedUntil) {
        v.stopped = false;
      }
      continue;
    }
    if (v.type !== 'PU' || f.angkotStopRate <= 0) continue;

    for (const e of world.events) {
      if (!e.active || e.kind !== 'angkot-stop') continue;
      const d = Math.abs(forwardDistance(v.x, e.position, geometry));
      if (d < 3) {
        v.stopped = true;
        v.stoppedUntil = world.t + world.rng.exponential(f.angkotDwellMean);
        break;
      }
    }
  }
}

function scheduleEvents(world: World, dt: number, params: Params): void {
  const f = params.friction;
  const { geometry } = world;

  const kinds: Array<[FrictionEvent['kind'], number, number]> = [
    ['angkot-stop', f.angkotStopRate, f.angkotDwellMean],
    ['pedestrian', f.pedestrianRate, 6],
    ['access', f.accessRate, 8],
  ];

  for (const [kind, ratePerHour, meanDuration] of kinds) {
    if (ratePerHour <= 0) continue;
    if (world.rng.next() >= (ratePerHour / HOUR) * dt) continue;

    const position = world.rng.uniform(0, geometry.length);
    // A pedestrian crossing blocks the full width briefly; an angkot stop or a
    // roadside access blocks the kerbside strip.
    const blocksAll = kind === 'pedestrian';

    world.events.push({
      kind,
      at: world.t,
      duration: world.rng.exponential(meanDuration),
      position,
      yFrom: blocksAll ? 0 : geometry.width - 2.2,
      yTo: geometry.width,
      active: false,
      done: false,
    });
  }
}

/** Width blocked at a position by active roadside events and parked vehicles, m. */
export function blockedWidthAt(x: number, world: World, params: Params): number {
  let blocked = params.friction.parkingWidth;
  for (const e of world.events) {
    if (!e.active) continue;
    if (Math.abs(forwardDistance(x, e.position, world.geometry)) > 6) continue;
    blocked = Math.max(blocked, e.yTo - e.yFrom);
  }
  return blocked;
}
