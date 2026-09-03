import { createDetector } from '../sim/detectors';
import { seedFromString } from '../sim/rng';
import { DEFAULT_TYPES } from '../sim/defaults';
import type { Scenario } from './types';

/**
 * Sugiyama's circular track (PRD §5.1).
 *
 * Twenty-two vehicles on a 230 m single-lane ring. No bottleneck, no incident,
 * identical instructions. A jam appears from reaction dynamics alone and then
 * propagates backward forever.
 *
 * This is the first thing a user sees and it doubles as a validation test
 * (PRD §6.2). Everything the app is about — that congestion is emergent rather
 * than caused — is present in the first thirty seconds.
 */
export const phantomJam: Scenario = {
  id: 'phantom-jam',
  name: 'Phantom jam',
  blurb:
    'Twenty-two vehicles on a 230 m ring. No bottleneck and no incident. The jam ' +
    'forms from reaction dynamics alone and then travels backward forever.',
  citation:
    'Sugiyama et al. (2008), "Traffic jams without bottlenecks — experimental ' +
    'evidence for the physical mechanism of the formation of a jam", New Journal ' +
    'of Physics 10, 033001.',

  geometry: {
    length: 230,
    // Narrow enough that two cars cannot run abreast — the published track is
    // single-lane and the whole demonstration depends on vehicles being unable
    // to pass. It is still wide enough for a motorcycle to filter past a car,
    // which is what the second half of the scene is for.
    width: 2.75,
    ring: true,
    markings: false,
    laneCount: 1,
    reductions: [],
    gradient: 0,
  },

  params: {
    // The published experiment is all cars. Motorcycles are added by the user
    // afterwards, which is the second half of the scene.
    mcFraction: 0,
    hvShare: 0,
    puShare: 0,
    inflow: 0,
    lateralRule: 'sublane',

    // Parameters for this scene follow the experiment rather than the app's
    // urban corridor defaults. The drivers were instructed to hold 30 km/h, so
    // v0 is 8.3 m/s. The low maximum acceleration is what puts the ring in the
    // string-unstable regime — a driver who responds gently to an opening gap
    // overshoots the correction, and that overshoot is the jam. With the
    // corridor defaults the same ring is stable and no jam forms, which is a
    // real property of the model and not a bug: instability depends on the
    // parameters, and that dependence is worth seeing.
    types: {
      ...DEFAULT_TYPES,
      LV: {
        ...DEFAULT_TYPES.LV,
        idm: { v0: 8.3, T: 1.2, s0: 2.0, a: 0.5, b: 1.67, delta: 4 },
      },
    },
  },

  detectors: [createDetector('R1', 0), createDetector('R2', 115)],
  signal: null,
  seedVehicles: 22,
  seed: seedFromString('phantom-jam'),
  // The Sugiyama track ran at roughly 30 km/h.
  rampSpeed: 8.3,
};
