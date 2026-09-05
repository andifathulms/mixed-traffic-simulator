/// <reference lib="webworker" />
import { DT, type Params } from '../sim/types';
import { step } from '../sim/world';
import { SCENARIOS } from '../scenarios';
import { buildWorld } from '../scenarios/build';
import {
  attachDetectorLog,
  createDetectorLog,
  type DetectorLog,
} from '../sim/detectors';
import { allEstimates } from '../estimators';
import { substitutionEmp } from '../truth/substitution';
import type { Scenario } from '../scenarios/types';
import { LATERAL_RULES } from '../sim/lateral';
import type { LateralRuleId } from '../sim/types';
import type {
  SweepComparison,
  SweepMessage,
  SweepPointResult,
  SweepRequest,
  SweepResponse,
} from './protocol';

/**
 * Batch sweeps, headless and off the main thread.
 *
 * The interactive simulation stays on the main thread — at 400 vehicles it is
 * well inside budget and a worker would add latency to every control. Only the
 * sweep comes here, because it runs thousands of simulated seconds and would
 * otherwise freeze the interface (CLAUDE.md §Stack).
 *
 * Because the engine is deterministic and seeded, a sweep is reproducible from
 * its seed and parameter set alone, so both are returned with the result.
 */

let cancelled = false;

function post(message: SweepResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

function applyVariable(
  scenario: Scenario,
  params: Params,
  variable: SweepRequest['variable'],
  value: number,
): { scenario: Scenario; params: Params } {
  const next: Params = { ...params };
  let nextScenario = scenario;

  switch (variable) {
    case 'mcFraction':
      next.mcFraction = value;
      break;
    case 'inflow':
      next.inflow = value;
      break;
    case 'width':
      nextScenario = {
        ...scenario,
        geometry: { ...scenario.geometry, width: value },
      };
      break;
    case 'green':
      nextScenario = scenario.signal
        ? { ...scenario, signal: { ...scenario.signal, green: value } }
        : scenario;
      break;
  }

  return { scenario: nextScenario, params: next };
}

/**
 * A single arm of the comparison: one run, or one slice of one run.
 *
 * `station` is the odd one out and the cheap one. Every other comparison
 * changes the simulation and costs a further run per swept point; a station is
 * a different place to stand while watching the same run, so it costs nothing
 * but a filter on the records afterwards.
 */
interface Arm {
  key: string;
  label: string;
  seedOffset: number;
  mutate: (scenario: Scenario, params: Params) => { scenario: Scenario; params: Params };
}

const IDENTITY = (scenario: Scenario, params: Params) => ({ scenario, params });

function armsFor(
  comparison: SweepComparison,
  replicates: number,
  scenario: Scenario,
): Arm[] {
  switch (comparison) {
    case 'lateralRule':
      return (Object.keys(LATERAL_RULES) as LateralRuleId[]).map((id) => ({
        key: id,
        label: LATERAL_RULES[id].name,
        seedOffset: 0,
        mutate: (s: Scenario, p: Params) => ({
          scenario: s,
          params: { ...p, lateralRule: id },
        }),
      }));

    case 'seed':
      return Array.from({ length: Math.max(2, replicates) }, (_, i) => ({
        key: `seed-${i}`,
        label: `Run ${i + 1}`,
        seedOffset: i,
        mutate: IDENTITY,
      }));

    case 'rhk':
      // Only meaningful where there is a signal to put the box in front of.
      if (!scenario.signal) return [{ key: 'base', label: '', seedOffset: 0, mutate: IDENTITY }];
      return [false, true].map((on) => ({
        key: on ? 'rhk-on' : 'rhk-off',
        label: on ? 'With stop box' : 'Without stop box',
        seedOffset: 0,
        mutate: (s: Scenario, p: Params) => ({
          scenario: s.signal ? { ...s, signal: { ...s.signal, rhk: on } } : s,
          params: p,
        }),
      }));

    case 'station':
    case 'none':
    default:
      return [{ key: 'base', label: '', seedOffset: 0, mutate: IDENTITY }];
  }
}

function observePoint(
  scenario: Scenario,
  params: Params,
  seed: number,
  warmup: number,
  measure: number,
): { log: DetectorLog; observedUntil: number; throughput: number } {
  const world = buildWorld(scenario, params, seed);

  const warmupSteps = Math.round(warmup / DT);
  for (let i = 0; i < warmupSteps; i++) step(world, DT, params);

  // The detector log is attached only for the measured period, so the warmup
  // transient does not enter the estimates. A field study does not count the
  // hour before it arrived.
  const log = createDetectorLog();
  const departedAtStart = world.departed;
  const startTime = world.t;

  attachDetectorLog(log);
  try {
    const measureSteps = Math.round(measure / DT);
    for (let i = 0; i < measureSteps; i++) step(world, DT, params);
  } finally {
    attachDetectorLog(null);
  }

  // Crossing times are absolute simulation time; rebase them so the estimators
  // see an observation period starting at zero.
  for (const r of log.records) r.crossingTime -= startTime;

  return {
    log,
    observedUntil: world.t - startTime,
    throughput: ((world.departed - departedAtStart) / measure) * 3600,
  };
}

function runSweep(request: SweepRequest): void {
  const started = Date.now();
  const base = SCENARIOS[request.scenario];
  const arms = armsFor(request.comparison, request.replicates, base);
  const runs = request.values.length * arms.length;
  let done = 0;

  for (const value of request.values) {
    for (const arm of arms) {
      if (cancelled) {
        post({ kind: 'cancelled' });
        return;
      }

      const varied = applyVariable(base, request.params, request.variable, value);
      const { scenario, params } = arm.mutate(varied.scenario, varied.params);
      const seed = request.seed + arm.seedOffset;

      const observed = observePoint(
        scenario,
        params,
        seed,
        request.warmup,
        request.measure,
      );

      let truth: number | null = null;
      let truthWarnings: string[] = [];
      if (request.includeTruth) {
        // Ground truth costs two further runs per point, which is why it is
        // optional rather than always on.
        const result = substitutionEmp(scenario, params, seed, {
          warmup: request.warmup,
          measure: request.measure,
        });
        truth = Number.isFinite(result.emp) ? result.emp : null;
        truthWarnings = result.warnings;
      }

      /*
       * Comparing across stations partitions one run rather than repeating it.
       *
       * The estimators are given the records of a single detector instead of
       * every detector pooled, which is the whole point: on a bottleneck the
       * three loops sit upstream, in the pinch and downstream, and pooling
       * them reports one number for three different roads. The truth figure is
       * the same for every station, because ground truth is a property of the
       * run and not of where you stood to watch it. That it does not move
       * while the estimates do is the finding.
       */
      const slices =
        request.comparison === 'station'
          ? scenario.detectors.map((d) => ({
              key: d.id,
              label: d.id,
              records: observed.log.records.filter((r) => r.detectorId === d.id),
            }))
          : [{ key: arm.key, label: arm.label, records: observed.log.records }];

      for (const slice of slices) {
        const estimates = allEstimates(
          slice.records,
          request.interval,
          observed.observedUntil,
        );

        post({
          kind: 'point',
          point: {
            value,
            seriesKey: slice.key,
            seriesLabel: slice.label,
            mcFraction: params.mcFraction,
            truth,
            truthWarnings,
            headway: estimates.headway,
            regression: estimates.regression,
            speed: estimates.speed,
            occupancy: estimates.occupancy,
            throughput: observed.throughput,
          } satisfies SweepPointResult,
        });
      }

      done++;
      post({ kind: 'progress', done, total: runs });
    }
  }

  post({
    kind: 'done',
    seed: request.seed,
    params: request.params,
    scenario: request.scenario,
    elapsedMs: Date.now() - started,
  });
}

self.onmessage = (event: MessageEvent<SweepMessage>) => {
  const message = event.data;
  if (message.kind === 'cancel') {
    cancelled = true;
    return;
  }
  cancelled = false;
  try {
    runSweep(message);
  } catch (error) {
    post({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
