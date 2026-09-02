import type { LateralRuleId, Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type { AggregationInterval } from '../estimators';

export type InstrumentTab =
  | 'bench'
  | 'heatmap'
  | 'lateral'
  | 'discharge'
  | 'inspector'
  | 'fundamental';

/**
 * Scenario overrides the user can set.
 *
 * Road width is continuous rather than a lane count, because lanes are a
 * marking and marking is optional (PRD §4.6). Markings are a separate toggle,
 * and only the strict-lane rule reads them — switching them off under the other
 * two rules changes nothing, which is itself worth being able to see.
 */
export interface ScenarioOverrides {
  /** Usable road width, m. Null means the scenario's own. */
  width: number | null;
  markings: boolean | null;
  laneCount: number | null;
  /** Gradient as a fraction; positive is uphill. */
  gradient: number | null;
  /** Width removed at the bottleneck throat, m. Only used where one exists. */
  bottleneckSeverity: number | null;
  /** Ruang Henti Khusus, the advance motorcycle stop box. */
  rhk: boolean | null;
  /** Green time, s. */
  green: number | null;
  /** Cycle length, s. */
  cycle: number | null;
}

export const NO_OVERRIDES: ScenarioOverrides = {
  width: null,
  markings: null,
  laneCount: null,
  gradient: null,
  bottleneckSeverity: null,
  rhk: null,
  green: null,
  cycle: null,
};

export interface AppState {
  scenario: ScenarioId;
  params: Params;
  lateralRule: LateralRuleId;
  seed: number;
  /** Speed multiplier, 0.25× to 16×. */
  speed: number;
  running: boolean;
  selectedVehicle: number | null;
  aggregationInterval: AggregationInterval;
  tab: InstrumentTab;
  overrides: ScenarioOverrides;
}

export const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
