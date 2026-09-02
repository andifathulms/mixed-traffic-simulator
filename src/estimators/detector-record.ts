/**
 * The ONLY type shared across the estimator boundary.
 *
 * `src/sim/detectors.ts` produces these. `src/estimators/*` consume these and
 * nothing else — the ESLint rule in eslint.config.js fails the build if an
 * estimator reaches for vehicle state.
 *
 * Every field here is something a roadside observer or an inductive loop could
 * actually obtain. If an estimator needs something it cannot get from this
 * record, that is the finding, not an obstacle to route around. Real field
 * engineers had the same problem (CLAUDE.md §5).
 */

/** What an observer classifies by eye. Duplicated deliberately — importing the
 * simulation's own type would be an import path across the boundary. */
export type ObservedClass = 'MC' | 'LV' | 'HV' | 'PU';

export interface DetectorRecord {
  detectorId: string;
  /** Seconds since the run began. */
  crossingTime: number;
  vehicleClass: ObservedClass;
  /** Spot speed as a loop or radar would measure it, m/s. */
  spotSpeed: number;
  /** Time the detector was covered, s. */
  occupancyTime: number;
  /** Lateral position, m from the left edge. Observable from a camera. */
  lateralPosition: number;
}

export const OBSERVED_CLASSES: readonly ObservedClass[] = ['MC', 'LV', 'HV', 'PU'];
