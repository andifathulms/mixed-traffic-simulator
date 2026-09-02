import { createDetector } from '../sim/detectors';
import { createSignal } from '../sim/signal';
import { seedFromString } from '../sim/rng';
import { phantomJam } from './phantom-jam';
import type { Scenario, ScenarioId } from './types';

export type { Scenario, ScenarioId } from './types';
export { phantomJam };
export { buildWorld, scenarioParams } from './build';

const CORRIDOR_LENGTH = 2000;
const URBAN_RAMP = 15.3;

/** Detectors at quarter points, as a field study would place them. */
function corridorDetectors(length: number) {
  return [
    createDetector('D1', length * 0.25),
    createDetector('D2', length * 0.5),
    createDetector('D3', length * 0.75),
  ];
}

/** The workhorse scenario: open road, inflow at one end, free exit (PRD §5.2). */
export const corridor: Scenario = {
  id: 'corridor',
  name: 'Corridor',
  blurb:
    'An open two-way-width urban road with inflow at one end and a free exit at ' +
    'the other. Motorcycle fraction, width and side friction are all live.',
  citation: null,
  geometry: {
    length: CORRIDOR_LENGTH,
    width: 7,
    ring: false,
    markings: false,
    laneCount: 2,
    reductions: [],
    gradient: 0,
  },
  params: { inflow: 2400, mcFraction: 0.6, lateralRule: 'sublane' },
  detectors: corridorDetectors(CORRIDOR_LENGTH),
  signal: null,
  seedVehicles: 0,
  seed: seedFromString('corridor'),
  rampSpeed: URBAN_RAMP,
};

/** Width reduction mid-corridor: capacity drop and a standing queue (PRD §5.3). */
export const bottleneck: Scenario = {
  id: 'bottleneck',
  name: 'Bottleneck',
  blurb:
    'The same corridor narrowed from 7 m to 4 m over 150 m at the midpoint. ' +
    'Outflow from the resulting queue is lower than the capacity that caused it.',
  citation: null,
  geometry: {
    length: CORRIDOR_LENGTH,
    width: 7,
    ring: false,
    markings: false,
    laneCount: 2,
    // Four metres through the throat. Two light vehicles fit abreast with
    // little to spare and a heavy vehicle beside anything does not, so the
    // merge is real rather than nominal. The severity is a live control, so
    // the user can close it further and watch what that does.
    reductions: [{ at: CORRIDOR_LENGTH / 2, span: 150, severity: 3 }],
    gradient: 0,
  },
  params: { inflow: 3000, mcFraction: 0.6, lateralRule: 'sublane' },
  detectors: [
    createDetector('D1', CORRIDOR_LENGTH * 0.25),
    // Immediately upstream and downstream of the throat, so the capacity drop
    // is measurable rather than inferred.
    createDetector('UP', CORRIDOR_LENGTH / 2 - 120),
    createDetector('DOWN', CORRIDOR_LENGTH / 2 + 120),
  ],
  signal: null,
  seedVehicles: 0,
  seed: seedFromString('bottleneck'),
  rampSpeed: URBAN_RAMP,
};

/** One approach, fixed-time signal, RHK toggle (PRD §5.4). */
export const signalised: Scenario = {
  id: 'signal',
  name: 'Signalised approach',
  blurb:
    'One approach to a fixed-time signal. The advance motorcycle stop box can be ' +
    'switched on and off, and the discharge plot measures the difference.',
  citation:
    'Ruang Henti Khusus is the advance motorcycle stop box used at Indonesian ' +
    'signalised intersections. Signal timing here is illustrative and is not ' +
    'taken from any specific junction.',
  geometry: {
    length: 800,
    width: 7,
    ring: false,
    markings: false,
    laneCount: 2,
    reductions: [],
    gradient: 0,
  },
  params: { inflow: 2200, mcFraction: 0.6, lateralRule: 'sublane' },
  detectors: [
    createDetector('APPROACH', 400),
    // Just downstream of the stop line — this is where saturation flow is measured.
    createDetector('STOPLINE', 610),
  ],
  signal: createSignal({ position: 600, cycle: 80, green: 30, amber: 3, allRed: 2 }),
  seedVehicles: 0,
  seed: seedFromString('signal'),
  rampSpeed: URBAN_RAMP,
};

/** Side friction as a mechanism rather than a coefficient (PRD §5.5). */
export const angkot: Scenario = {
  id: 'angkot',
  name: 'Angkot',
  blurb:
    'The corridor with public transport stopping at the roadside on demand. One ' +
    'stopping angkot can seed a wave that travels back a kilometre.',
  citation:
    'MKJI 1997 treats side friction as a capacity reduction factor derived from ' +
    'counted roadside events. This scenario simulates the events instead.',
  geometry: {
    length: CORRIDOR_LENGTH,
    width: 7,
    ring: false,
    markings: false,
    laneCount: 2,
    reductions: [],
    gradient: 0,
  },
  params: {
    inflow: 2400,
    mcFraction: 0.55,
    puShare: 0.22,
    lateralRule: 'sublane',
    friction: {
      angkotStopRate: 40,
      angkotDwellMean: 16,
      pedestrianRate: 20,
      accessRate: 30,
      parkingWidth: 1.8,
    },
  },
  detectors: corridorDetectors(CORRIDOR_LENGTH),
  signal: null,
  seedVehicles: 0,
  seed: seedFromString('angkot'),
  rampSpeed: URBAN_RAMP,
};

/**
 * The bench is a sweep rather than an animated scene (PRD §5.6), but it needs a
 * base scenario to sweep. It is the corridor at a fixed inflow.
 */
const BENCH_LENGTH = 900;

export const bench: Scenario = {
  ...corridor,
  id: 'bench',
  name: 'Equivalence bench',
  blurb:
    'A sweep rather than a scene. The corridor is run across motorcycle shares ' +
    'and every estimation method is applied to each run.',
  geometry: { ...corridor.geometry, length: BENCH_LENGTH },
  /*
   * Eight counting stations rather than three.
   *
   * The regression method needs many aggregation intervals before its
   * coefficients are identified, and a sweep point cannot simulate for hours.
   * More counting stations give more independent observations per second of
   * simulation, which is exactly what a field study does when it wants a
   * result in one shift rather than one month. With three detectors on a short
   * run the regression returned nothing at all at every swept point.
   */
  detectors: Array.from({ length: 8 }, (_, i) =>
    createDetector(`B${i + 1}`, (BENCH_LENGTH * (i + 1)) / 9),
  ),
  seed: seedFromString('bench'),
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'phantom-jam': phantomJam,
  corridor,
  bottleneck,
  signal: signalised,
  angkot,
  bench,
};

export const SCENARIO_ORDER: ScenarioId[] = [
  'phantom-jam',
  'corridor',
  'bottleneck',
  'signal',
  'angkot',
  'bench',
];

/** Stated once, with the scenario chooser, as a fact (DESIGN.md §7). */
export const NON_CALIBRATION_NOTICE =
  'Simulated with cited default parameters. Not calibrated to any specific location.';
