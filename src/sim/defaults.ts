import type { Params, TypeConfig, VehicleType } from './types';

/**
 * Cited default parameters. The app states its sources and states that it is
 * not calibrated to any specific location (PRD §7.4).
 */
export interface Citation {
  /** Short marker text shown inline. */
  marker: string;
  /** What the popover says. Null basis is stated plainly, never left empty. */
  text: string;
}

export const CITATIONS: Record<string, Citation> = {
  mkjiDimensions: {
    marker: 'MKJI 1997',
    text:
      'Manual Kapasitas Jalan Indonesia 1997, vehicle classification and representative ' +
      'dimensions for MC, LV and HV. PU dimensions follow the common Indonesian minibus ' +
      'angkot body on a light-vehicle chassis.',
  },
  mkjiEmp: {
    marker: 'MKJI 1997',
    text:
      'MKJI 1997 assigns motorcycles a fixed passenger car equivalent of 0.25 on divided ' +
      'urban roads and 0.5 on undivided urban roads. The constant does not vary with ' +
      'motorcycle fraction, flow, or geometry. That invariance is what this app examines.',
  },
  idm: {
    marker: 'IDM',
    text:
      'Treiber, Hennecke and Helbing (2000), "Congested traffic states in empirical ' +
      'observations and microscopic simulations", Physical Review E 62, 1805. Parameter ' +
      'ranges follow the paper; per-type values are adjusted for the vehicle class and ' +
      'are not calibrated to any Indonesian site.',
  },
  sugiyama: {
    marker: 'Sugiyama 2008',
    text:
      'Sugiyama et al. (2008), "Traffic jams without bottlenecks — experimental evidence ' +
      'for the physical mechanism of the formation of a jam", New Journal of Physics 10, ' +
      '033001. Twenty-two vehicles on a 230 m circular track, no bottleneck, no incident.',
  },
  mobil: {
    marker: 'MOBIL',
    text:
      'Kesting, Treiber and Helbing (2007), "General lane-changing model MOBIL for ' +
      'car-following models", Transportation Research Record 1999, 86–94.',
  },
  socialForce: {
    marker: 'no traffic-literature basis',
    text:
      'The social force rule adapts repulsive potentials from pedestrian dynamics ' +
      '(Helbing and Molnár, 1995). It has no basis in the traffic engineering ' +
      'literature and no calibration against traffic measurements. It is included ' +
      'because it reproduces motorcycle swarming well and because the difference ' +
      'between it and the other two rules is itself the finding.',
  },
  sideFriction: {
    marker: 'MKJI 1997',
    text:
      'MKJI 1997 treats side friction (hambatan samping) as a multiplicative capacity ' +
      'reduction factor derived from counted roadside events. This app simulates the ' +
      'events themselves rather than applying the factor.',
  },
};

/**
 * Per-type defaults. Dimensions from MKJI 1997; IDM parameters in the ranges of
 * Treiber et al. (2000), adjusted per class.
 */
export const DEFAULT_TYPES: Record<VehicleType, TypeConfig> = {
  MC: {
    length: 1.9,
    width: 0.7,
    // Motorcycles accept shorter headways and smaller gaps than cars. That
    // behavioural difference, not just the footprint, is why emp is contested.
    idm: { v0: 13.9, T: 0.8, s0: 0.8, a: 2.0, b: 2.5, delta: 4 },
    v0Jitter: 0.14,
    tJitter: 0.16,
  },
  LV: {
    length: 4.4,
    width: 1.7,
    idm: { v0: 15.3, T: 1.3, s0: 2.0, a: 1.4, b: 2.0, delta: 4 },
    v0Jitter: 0.11,
    tJitter: 0.13,
  },
  HV: {
    length: 12.0,
    width: 2.5,
    idm: { v0: 11.1, T: 1.8, s0: 3.0, a: 0.7, b: 1.6, delta: 4 },
    v0Jitter: 0.08,
    tJitter: 0.1,
  },
  PU: {
    length: 4.8,
    width: 1.9,
    idm: { v0: 13.0, T: 1.2, s0: 1.8, a: 1.2, b: 2.0, delta: 4 },
    v0Jitter: 0.12,
    tJitter: 0.14,
  },
};

/** MKJI's constant for motorcycles, drawn as a flat dashed rule on the bench. */
export const MKJI_MC_EMP = 0.25;

export const DEFAULT_PARAMS: Params = {
  inflow: 1800,
  mcFraction: 0.6,
  hvShare: 0.08,
  puShare: 0.1,
  arrival: 'poisson',
  lateralRule: 'sublane',
  types: DEFAULT_TYPES,
  // A vehicle ahead constrains this one once footprints overlap by this
  // fraction of the narrower width. Exposed because it materially changes
  // filtering behaviour (CLAUDE.md §3).
  overlapThreshold: 0.25,
  overlapExponent: 1,
  maxLateralSpeed: { MC: 1.0, LV: 0.3, HV: 0.2, PU: 0.3 },
  lateralCentring: 0.35,
  socialStrength: 2.4,
  socialRange: 2.2,
  friction: {
    angkotStopRate: 0,
    angkotDwellMean: 14,
    pedestrianRate: 0,
    accessRate: 0,
    parkingWidth: 0,
  },
};

export function cloneParams(p: Params): Params {
  return {
    ...p,
    types: {
      MC: { ...p.types.MC, idm: { ...p.types.MC.idm } },
      LV: { ...p.types.LV, idm: { ...p.types.LV.idm } },
      HV: { ...p.types.HV, idm: { ...p.types.HV.idm } },
      PU: { ...p.types.PU, idm: { ...p.types.PU.idm } },
    },
    maxLateralSpeed: { ...p.maxLateralSpeed },
    friction: { ...p.friction },
  };
}
