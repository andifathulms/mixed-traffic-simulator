import type { Geometry, Params, SignalState, Detector } from '../sim/types';

export type ScenarioId =
  | 'phantom-jam'
  | 'corridor'
  | 'bottleneck'
  | 'signal'
  | 'angkot'
  | 'bench';

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** One sentence, sentence case, no exclamation marks. */
  blurb: string;
  /** Where the parameters come from, or null when they are this app's choice. */
  citation: string | null;
  geometry: Geometry;
  /** Overrides applied on top of DEFAULT_PARAMS. */
  params: Partial<Params>;
  detectors: Detector[];
  signal: SignalState | null;
  /** Vehicles placed at t = 0. Open corridors start empty and fill from inflow. */
  seedVehicles: number;
  /** Default seed, so the preset is reproducible without a URL. */
  seed: number;
  /** Free-flow speed the speed ramp normalises to, m/s (DESIGN.md §2.2). */
  rampSpeed: number;
}
