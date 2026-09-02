import type { AppState } from './app-state';
import { DEFAULT_PARAMS, cloneParams } from '../sim/defaults';
import { SCENARIOS } from '../scenarios';
import type { ScenarioId } from '../scenarios/types';
import type { ArrivalProcess, LateralRuleId, Params } from '../sim/types';
import { AGGREGATION_INTERVALS, type AggregationInterval } from '../estimators';
import { scenarioParams } from '../scenarios/build';

/**
 * URL serialisation.
 *
 * Everything except `running` and `selectedVehicle` round-trips through the
 * query string. A surprising result must be shareable as a link that
 * reproduces it exactly — this is a PRD commitment (§7.3), not a convenience.
 *
 * Only values that differ from the scenario's own defaults are written, so a
 * shared link stays readable and a future change to a default does not silently
 * rewrite the meaning of an old link's omitted fields — an omitted field means
 * "the default", and that is what the link says.
 */

const LATERAL_RULES: LateralRuleId[] = ['lanes', 'sublane', 'social'];
const ARRIVALS: ArrivalProcess[] = ['poisson', 'uniform', 'platooned'];

/** Fields written as plain numbers, with the precision each deserves. */
const NUMERIC: Array<[keyof Params, string, number]> = [
  ['inflow', 'q', 0],
  ['mcFraction', 'mc', 4],
  ['hvShare', 'hv', 4],
  ['puShare', 'pu', 4],
  ['overlapThreshold', 'ot', 4],
  ['overlapExponent', 'oe', 3],
  ['lateralCentring', 'lc', 3],
  ['socialStrength', 'ss', 3],
  ['socialRange', 'sr', 3],
  ['lateralDecisionInterval', 'ld', 3],
];

export function stateToSearch(state: AppState): string {
  const scenario = SCENARIOS[state.scenario];
  const defaults = scenarioParams(scenario);
  const p = new URLSearchParams();

  p.set('s', state.scenario);
  if (state.seed !== scenario.seed) p.set('seed', String(state.seed));
  if (state.lateralRule !== defaults.lateralRule) p.set('rule', state.lateralRule);
  if (state.speed !== 1) p.set('x', String(state.speed));
  if (state.aggregationInterval !== 300) p.set('agg', String(state.aggregationInterval));
  if (state.tab !== 'bench') p.set('tab', state.tab);

  for (const [key, short, digits] of NUMERIC) {
    const value = state.params[key] as number;
    const fallback = defaults[key] as number;
    if (Math.abs(value - fallback) > Number.EPSILON) {
      p.set(short, digits === 0 ? String(Math.round(value)) : trim(value, digits));
    }
  }

  if (state.params.arrival !== defaults.arrival) p.set('arr', state.params.arrival);

  const g = state.params;
  const f = g.friction;
  const fd = defaults.friction;
  if (f.angkotStopRate !== fd.angkotStopRate) p.set('fa', String(f.angkotStopRate));
  if (f.angkotDwellMean !== fd.angkotDwellMean) p.set('fd', String(f.angkotDwellMean));
  if (f.pedestrianRate !== fd.pedestrianRate) p.set('fp', String(f.pedestrianRate));
  if (f.accessRate !== fd.accessRate) p.set('fc', String(f.accessRate));
  if (f.parkingWidth !== fd.parkingWidth) p.set('fw', trim(f.parkingWidth, 2));

  return p.toString();
}

function trim(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

function num(
  p: URLSearchParams,
  key: string,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const raw = p.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  // A malformed or out-of-range link falls back to the default rather than
  // throwing. A shared link that has been hand-edited should still open.
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(lo, Math.min(hi, parsed));
}

export function searchToState(search: string): AppState {
  const p = new URLSearchParams(search);

  const scenarioId = (p.get('s') ?? 'phantom-jam') as ScenarioId;
  const scenario = SCENARIOS[scenarioId] ?? SCENARIOS['phantom-jam'];
  const defaults = scenarioParams(scenario);
  const params = cloneParams(defaults);

  params.inflow = num(p, 'q', defaults.inflow, 0, 20000);
  params.mcFraction = num(p, 'mc', defaults.mcFraction, 0, 0.95);
  params.hvShare = num(p, 'hv', defaults.hvShare, 0, 1);
  params.puShare = num(p, 'pu', defaults.puShare, 0, 1);
  params.overlapThreshold = num(p, 'ot', defaults.overlapThreshold, 0, 0.95);
  params.overlapExponent = num(p, 'oe', defaults.overlapExponent, 0.1, 6);
  params.lateralCentring = num(p, 'lc', defaults.lateralCentring, 0, 4);
  params.socialStrength = num(p, 'ss', defaults.socialStrength, 0, 20);
  params.socialRange = num(p, 'sr', defaults.socialRange, 0.2, 10);
  params.lateralDecisionInterval = num(p, 'ld', defaults.lateralDecisionInterval, 0.05, 2);

  const arrival = p.get('arr') as ArrivalProcess | null;
  params.arrival = arrival && ARRIVALS.includes(arrival) ? arrival : defaults.arrival;

  params.friction = {
    angkotStopRate: num(p, 'fa', defaults.friction.angkotStopRate, 0, 500),
    angkotDwellMean: num(p, 'fd', defaults.friction.angkotDwellMean, 1, 300),
    pedestrianRate: num(p, 'fp', defaults.friction.pedestrianRate, 0, 1000),
    accessRate: num(p, 'fc', defaults.friction.accessRate, 0, 1000),
    parkingWidth: num(p, 'fw', defaults.friction.parkingWidth, 0, 4),
  };

  const rule = p.get('rule') as LateralRuleId | null;
  const lateralRule = rule && LATERAL_RULES.includes(rule) ? rule : defaults.lateralRule;
  params.lateralRule = lateralRule;

  const aggRaw = num(p, 'agg', 300, 1, 7200);
  const aggregationInterval = (AGGREGATION_INTERVALS as readonly number[]).includes(aggRaw)
    ? (aggRaw as AggregationInterval)
    : 300;

  return {
    scenario: scenario.id,
    params,
    lateralRule,
    seed: Math.round(num(p, 'seed', scenario.seed, 0, 4294967295)),
    speed: num(p, 'x', 1, 0.25, 16),
    // Deliberately not serialised: they describe where the user is looking,
    // not what is being simulated.
    running: false,
    selectedVehicle: null,
    aggregationInterval,
    tab: (p.get('tab') as AppState['tab']) ?? 'bench',
  };
}

export { DEFAULT_PARAMS };
