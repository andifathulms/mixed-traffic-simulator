import type { SignalAspect, VehicleType, World } from './types';
import { forwardDistance } from './geometry';

/**
 * Discharge records at the stop line.
 *
 * One entry per vehicle crossing the stop line after a green, with its position
 * in the discharging queue. Saturation headway appears as the level the series
 * flattens to after the first few positions (DESIGN.md §5.7).
 */
export interface DischargeRecord {
  cycleIndex: number;
  /** 1 for the first vehicle away, 2 for the second, and so on. */
  queuePosition: number;
  /** Time headway from the previous discharging vehicle, s. */
  headway: number;
  type: VehicleType;
  /** Whether the RHK box was enabled for this cycle. */
  rhk: boolean;
}

export class DischargeRecorder {
  readonly records: DischargeRecord[] = [];
  /** Vehicles that were stopped in the queue during the preceding red. */
  private queued = new Set<number>();
  private crossed = new Set<number>();
  private lastAspect: SignalAspect | null = null;
  private position = 0;
  private lastCrossingTime = 0;

  /** Call once per step, after the signal has advanced. */
  observe(world: World, dt = 0.05): void {
    const s = world.signal;
    if (!s) return;

    // Reset on the transition into green, not on the cycle boundary. The
    // fixed-time cycle runs green, amber, then red, so the queue that green
    // discharges was built during the red at the *end of the previous cycle*.
    // Clearing on the cycle index wiped that queue at the exact moment it
    // started to discharge, and nothing was ever recorded.
    const enteringGreen = s.aspect === 'green' && this.lastAspect !== 'green';
    if (enteringGreen) {
      this.position = 0;
      this.crossed.clear();
    }
    const leavingGreen = s.aspect !== 'green' && this.lastAspect === 'green';
    if (leavingGreen) this.queued.clear();
    this.lastAspect = s.aspect;

    // Saturation flow is a property of a discharging queue, not of a green
    // interval. Once the queue clears, vehicles arrive freely and their
    // headways measure the arrival process instead — including them made later
    // queue positions *more* variable than early ones, which is the opposite of
    // what a discharge curve should show. So membership of the queue is
    // recorded while the signal is red, and only those vehicles are counted.
    if (s.aspect !== 'green') {
      for (const v of world.vehicles) {
        if (v.v >= 0.5) continue;
        if (forwardDistance(v.x, s.position, world.geometry) <= 0) continue;
        this.queued.add(v.id);
      }
      return;
    }

    for (const v of world.vehicles) {
      if (this.crossed.has(v.id)) continue;
      if (!this.queued.has(v.id)) continue;

      const ahead = forwardDistance(v.x, s.position, world.geometry);
      if (ahead > 0) continue;
      if (v.v < 0.5) continue;

      this.crossed.add(v.id);
      this.position++;

      // Interpolate the crossing within the step, as the detectors do. Without
      // it, vehicles discharging abreast — which is exactly what motorcycles do
      // — all land on the same step boundary and report a headway of exactly
      // zero, which is an artefact of the timestep rather than a measurement.
      const travelled = Math.max(1e-6, v.v * dt);
      const overshoot = Math.min(travelled, -ahead);
      const crossingTime = world.t - (overshoot / travelled) * dt;

      const headway = crossingTime - this.lastCrossingTime;
      this.lastCrossingTime = crossingTime;

      // The first vehicle away has no predecessor in this cycle, so it has no
      // headway. Recording one would drag the saturation estimate down.
      if (this.position > 1 && headway > 0) {
        this.records.push({
          cycleIndex: s.cycleIndex,
          queuePosition: this.position,
          headway,
          type: v.type,
          rhk: s.rhk,
        });
      }

      if (this.records.length > 5000) this.records.shift();
    }
  }

  clear(): void {
    this.records.length = 0;
    this.queued.clear();
    this.crossed.clear();
    this.lastAspect = null;
    this.position = 0;
  }
}

/**
 * Saturation headway, s: the level the series flattens to.
 *
 * Measured from position five onward, because the first few vehicles are still
 * accelerating from rest and their headways are not saturation headways. That
 * cut-off is the standard field practice and it is why the plot shows position
 * on the horizontal axis rather than reporting a single mean.
 */
export function saturationHeadway(
  records: readonly DischargeRecord[],
  rhk?: boolean,
): { headway: number; sampleCount: number } | null {
  const use = records.filter(
    (r) => r.queuePosition >= 5 && (rhk === undefined || r.rhk === rhk),
  );
  if (use.length < 5) return null;
  return {
    headway: use.reduce((s, r) => s + r.headway, 0) / use.length,
    sampleCount: use.length,
  };
}

/** Saturation flow, veh/h, from the saturation headway. */
export function saturationFlow(headway: number): number {
  return headway > 0 ? 3600 / headway : 0;
}
