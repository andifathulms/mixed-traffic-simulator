import type { Geometry, World } from './types';

/**
 * Measurements taken from the simulation's own state.
 *
 * This module MAY read vehicle state — it is not an estimator. It backs the
 * time–space diagram's measuring tool (DESIGN.md §5.2) and the correctness
 * tests, both of which are about the simulation itself rather than about what
 * an observer could infer from a roadside.
 */

export interface StopEvent {
  vehicleId: number;
  /** When the vehicle first fell below the stop threshold, s. */
  t: number;
  /** Where it stopped, m. */
  x: number;
}

/** Speed below which a vehicle counts as having joined the jam, m/s. */
export const STOP_THRESHOLD = 1.0;

export class WaveTracker {
  private stopped = new Set<number>();
  readonly events: StopEvent[] = [];

  /** Call once per step. Records the moment each vehicle joins a jam. */
  observe(world: World): void {
    for (const v of world.vehicles) {
      if (v.v < STOP_THRESHOLD) {
        if (!this.stopped.has(v.id)) {
          this.stopped.add(v.id);
          this.events.push({ vehicleId: v.id, t: world.t, x: v.x });
        }
      } else if (v.v > STOP_THRESHOLD * 2.5) {
        // Hysteresis: a vehicle must clearly recover before it can be counted
        // as joining the jam again, or a vehicle hovering at the threshold
        // would emit an event every other step.
        this.stopped.delete(v.id);
      }
    }
  }
}

/**
 * Backward wave speed, km/h, from successive vehicles joining a jam.
 *
 * The jam front moves upstream: each vehicle stops slightly behind and slightly
 * later than the one in front of it. The slope of stop position against stop
 * time is the wave speed. This is the standard field method and it is what the
 * measuring tool on the time–space diagram computes.
 *
 * Returns a negative value, because the wave travels against the flow. Null
 * when there are too few events to fit a line.
 */
export function backwardWaveSpeed(
  events: StopEvent[],
  geometry: Geometry,
  /** Ignore events before this time, to skip the formation transient. */
  after = 0,
): number | null {
  const use = events.filter((e) => e.t >= after).sort((a, b) => a.t - b.t);
  if (use.length < 6) return null;

  // Unwrap positions on a ring so the regression sees a straight line rather
  // than a sawtooth. Consecutive stops are always close together in space.
  const xs: number[] = [use[0].x];
  for (let i = 1; i < use.length; i++) {
    let d = use[i].x - use[i - 1].x;
    if (geometry.ring) {
      const L = geometry.length;
      if (d > L / 2) d -= L;
      if (d < -L / 2) d += L;
    }
    xs.push(xs[i - 1] + d);
  }

  const n = use.length;
  const meanT = use.reduce((s, e) => s + e.t, 0) / n;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (use[i].t - meanT) * (xs[i] - meanX);
    den += (use[i].t - meanT) ** 2;
  }
  if (den === 0) return null;

  return (num / den) * 3.6;
}

/** Mean speed across all vehicles, m/s. Zero when the road is empty. */
export function meanSpeed(world: World): number {
  if (world.vehicles.length === 0) return 0;
  let sum = 0;
  for (const v of world.vehicles) sum += v.v;
  return sum / world.vehicles.length;
}

/** Density, veh/km, from the true vehicle count. Ground truth, not an estimate. */
export function trueDensity(world: World): number {
  return (world.vehicles.length / world.geometry.length) * 1000;
}

/** Flow, veh/h, as the product of true density and space-mean speed. */
export function trueFlow(world: World): number {
  return trueDensity(world) * meanSpeed(world) * 3.6;
}
