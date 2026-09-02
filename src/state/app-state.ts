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
}

export const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
