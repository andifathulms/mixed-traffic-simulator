import type { Detector, World } from './types';
import type { DetectorRecord } from '../estimators/detector-record';
import { forwardDistance } from './geometry';

/**
 * Virtual loop detectors — the ONLY input the estimators are permitted.
 *
 * Everything an estimator will ever see is produced here, and it is restricted
 * to what a loop or a roadside observer could actually measure: a crossing
 * time, a class judged by eye, a spot speed, an occupancy time and a lateral
 * position. No identity, no trajectory, no true mean speed (PRD §7.2).
 */

export function createDetector(id: string, position: number, zoneLength = 1.8): Detector {
  return { id, position, zoneLength };
}

/** Records accumulate here rather than on the World, so the boundary type stays clean. */
export interface DetectorLog {
  records: DetectorRecord[];
  /** Bounded so a long run does not grow without limit. */
  capacity: number;
}

export function createDetectorLog(capacity = 200000): DetectorLog {
  return { records: [], capacity };
}

let activeLog: DetectorLog | null = null;

export function attachDetectorLog(log: DetectorLog | null): void {
  activeLog = log;
}

export function getDetectorLog(): DetectorLog | null {
  return activeLog;
}

/**
 * Record vehicles that crossed a detector during this step.
 *
 * The crossing time is interpolated within the step rather than snapped to the
 * step boundary, because headway estimates at 0.05 s resolution would otherwise
 * quantise into bands and the time-headway method would measure the timestep
 * instead of the traffic.
 */
export function recordCrossings(world: World, dt: number): void {
  const log = activeLog;
  if (!log) return;

  const detectors = world.detectors;
  if (detectors.length === 0) return;

  // Vehicles outermost, detectors innermost. The other order walks the whole
  // vehicle list once per detector, which is the difference between one pass
  // and eight over several hundred vehicles, twenty times a second.
  for (const v of world.vehicles) {
    if (v.v <= 0) continue;

    const travelled = v.v * dt;
    const noseNow = v.x + v.length / 2;
    const noseBefore = noseNow - travelled;

    for (let d = 0; d < detectors.length; d++) {
      const det = detectors[d];

      const toDetector = forwardDistance(noseBefore, det.position, world.geometry);
      if (toDetector < 0 || toDetector > travelled) continue;

      // Guard against a second trigger at the same detector on a ring within
      // one step.
      if (v.lastDetectorIndex === d && travelled < 1) continue;
      v.lastDetectorIndex = d;

      const fraction = travelled > 0 ? toDetector / travelled : 0;

      log.records.push({
        detectorId: det.id,
        // Interpolated within the step. At 0.05 s resolution, snapping to the
        // step boundary would quantise headways into bands and the time
        // headway method would measure the timestep instead of the traffic.
        crossingTime: world.t + fraction * dt,
        vehicleClass: v.type,
        // A loop measures a spot speed, not a true instantaneous one. It is
        // the speed as the vehicle passes, which is what a radar gun reads.
        spotSpeed: v.v,
        // Time the loop was covered: the vehicle's length plus the zone,
        // divided by its speed. Exactly what a real loop reports, and the
        // whole input to the occupancy-time method.
        occupancyTime: (v.length + det.zoneLength) / Math.max(0.1, v.v),
        lateralPosition: v.y,
      });

      if (log.records.length > log.capacity) log.records.shift();
    }
  }
}
