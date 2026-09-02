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
import type {
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
  const total = request.values.length;

  for (let i = 0; i < total; i++) {
    if (cancelled) {
      post({ kind: 'cancelled' });
      return;
    }

    const value = request.values[i];
    const { scenario, params } = applyVariable(base, request.params, request.variable, value);

    const observed = observePoint(
      scenario,
      params,
      request.seed,
      request.warmup,
      request.measure,
    );

    const estimates = allEstimates(
      observed.log.records,
      request.interval,
      observed.observedUntil,
    );

    let truth: number | null = null;
    let truthWarnings: string[] = [];
    if (request.includeTruth) {
      // Ground truth costs two further runs per point, which is why it is
      // optional rather than always on.
      const result = substitutionEmp(scenario, params, request.seed, {
        warmup: request.warmup,
        measure: request.measure,
      });
      truth = Number.isFinite(result.emp) ? result.emp : null;
      truthWarnings = result.warnings;
    }

    const point: SweepPointResult = {
      value,
      mcFraction: params.mcFraction,
      truth,
      truthWarnings,
      headway: estimates.headway,
      regression: estimates.regression,
      speed: estimates.speed,
      occupancy: estimates.occupancy,
      throughput: observed.throughput,
    };

    post({ kind: 'point', point });
    post({ kind: 'progress', done: i + 1, total });
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
