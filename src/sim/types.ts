import type { Rng } from './rng';

/** MKJI 1997 classification, plus PU for angkot (PRD §4.1). */
export type VehicleType = 'MC' | 'LV' | 'HV' | 'PU';

export const VEHICLE_TYPES: readonly VehicleType[] = ['MC', 'LV', 'HV', 'PU'] as const;

export interface IdmParams {
  /** Desired speed, m/s. */
  v0: number;
  /** Safe time headway, s. */
  T: number;
  /** Minimum bumper-to-bumper gap, m. */
  s0: number;
  /** Maximum acceleration, m/s². */
  a: number;
  /** Comfortable deceleration, m/s². */
  b: number;
  /** Acceleration exponent. */
  delta: number;
}

export interface Vehicle {
  id: number;
  type: VehicleType;
  /** Longitudinal position, m. On a ring, wrapped into [0, length). */
  x: number;
  /** Lateral position of the vehicle centre, m from the left edge. */
  y: number;
  /** Speed, m/s. Never negative — vehicles do not reverse. */
  v: number;
  /** Longitudinal acceleration, m/s². */
  a: number;
  /** Lateral speed, m/s. */
  vLat: number;
  length: number;
  width: number;
  params: IdmParams;
  entryTime: number;
  /** Held at the roadside — an angkot dwelling, or a vehicle stopped by an event. */
  stopped: boolean;
  /** Simulation time at which a stopped vehicle may move again. */
  stoppedUntil: number;
  /** Distance travelled since entry, m. Survives ring wrapping. */
  distance: number;
  /** Which detectors this vehicle has already been recorded at. */
  lastDetectorIndex: number;
  /** Cached leader id for the inspector; not used by the physics. */
  leaderId: number | null;
  /** Cached IDM term decomposition for the inspector (DESIGN.md §5.8). */
  freeTerm: number;
  interactionTerm: number;
  desiredGap: number;
  currentGap: number;
}

/** A width reduction at a position — the bottleneck scenario (PRD §5.3). */
export interface WidthReduction {
  /** Centre of the reduction, m. */
  at: number;
  /** Length over which the road is narrowed, m. */
  span: number;
  /** Width removed at the deepest point, m. */
  severity: number;
}

export interface Geometry {
  /** Corridor length, or ring circumference, m. */
  length: number;
  /** Nominal usable road width, m. Width, not lane count — lanes are a marking. */
  width: number;
  /** Ring topology closes the corridor on itself (PRD §5.1). */
  ring: boolean;
  /** Lane markings painted. Only the strict-lane rule reads them. */
  markings: boolean;
  /** Number of marked lanes, when markings are on. */
  laneCount: number;
  reductions: WidthReduction[];
  /** Longitudinal gradient, fraction. Positive is uphill; affects HV (PRD §4.6). */
  gradient: number;
}

export type SignalAspect = 'red' | 'amber' | 'green';

export interface SignalState {
  /** Stop line position, m. */
  position: number;
  cycle: number;
  green: number;
  amber: number;
  allRed: number;
  aspect: SignalAspect;
  /** Seconds elapsed in the current cycle. */
  phaseTime: number;
  /** Ruang Henti Khusus — advance motorcycle stop box (PRD §4.4). */
  rhk: boolean;
  /** How far ahead of the main stop line the RHK box extends, m. */
  rhkDepth: number;
  /** Cycles completed, used by the discharge plot to separate cycles. */
  cycleIndex: number;
}

export interface Detector {
  id: string;
  /** Longitudinal position, m. */
  position: number;
  /** Detection zone length, m — a real loop is about 1.8 m long. */
  zoneLength: number;
}

export type WarningKind =
  | 'overlap'
  | 'nan'
  | 'step-cap'
  | 'deceleration-clamp'
  | 'demand-unserved';

export interface SimWarning {
  kind: WarningKind;
  /** Specific, per DESIGN.md §7 — never 'invalid result'. */
  message: string;
  t: number;
  count: number;
}

export type LateralRuleId = 'lanes' | 'sublane' | 'social';
export type ArrivalProcess = 'poisson' | 'uniform' | 'platooned';

/** Per-type demand and dimensions, all user-editable with cited defaults. */
export interface TypeConfig {
  length: number;
  width: number;
  idm: IdmParams;
  /** Standard deviation of the per-vehicle jitter on v0, as a fraction. */
  v0Jitter: number;
  /** Standard deviation of the per-vehicle jitter on T, as a fraction. */
  tJitter: number;
}

export interface SideFrictionParams {
  /** Angkot stopping events per hour. */
  angkotStopRate: number;
  /** Mean dwell time of an angkot stop, s. */
  angkotDwellMean: number;
  /** Pedestrian crossings per hour. */
  pedestrianRate: number;
  /** Vehicles entering or exiting roadside premises per hour. */
  accessRate: number;
  /** Roadside parking, as width removed from the kerbside edge, m. */
  parkingWidth: number;
}

export interface Params {
  /** Total inflow, veh/h, across all types. */
  inflow: number;
  /** Motorcycle share of inflow, 0..0.9 — the principal independent variable. */
  mcFraction: number;
  /** Shares of the non-motorcycle remainder. Normalised at use. */
  hvShare: number;
  puShare: number;
  arrival: ArrivalProcess;
  lateralRule: LateralRuleId;
  types: Record<VehicleType, TypeConfig>;
  /**
   * Lateral overlap fraction above which a vehicle ahead constrains this one.
   * A model parameter, not a constant (CLAUDE.md §3) — a motorcycle
   * half-overlapping a car's lane still constrains it, partially.
   */
  overlapThreshold: number;
  /** Exponent on the graded overlap weighting; 1 is linear. */
  overlapExponent: number;
  /** Maximum lateral speed by type, m/s. */
  maxLateralSpeed: Record<VehicleType, number>;
  /** Preference for holding the current lateral offset, suppressing chatter. */
  lateralCentring: number;
  /** Social force strength and range. */
  socialStrength: number;
  socialRange: number;
  friction: SideFrictionParams;
}

export interface World {
  t: number;
  step: number;
  vehicles: Vehicle[];
  geometry: Geometry;
  signal: SignalState | null;
  detectors: Detector[];
  rng: Rng;
  warnings: SimWarning[];
  /** Next vehicle id. Monotonic, so ids are never reused. */
  nextId: number;
  /** Vehicles that have left through the downstream boundary. */
  departed: number;
  /** Vehicles that could not be admitted because the entry was blocked. */
  unserved: number;
  /** Accumulated arrival credit per type, in vehicles. */
  arrivalCredit: Record<VehicleType, number>;
  /** Scheduled roadside events. */
  events: FrictionEvent[];
}

export interface FrictionEvent {
  kind: 'angkot-stop' | 'pedestrian' | 'access';
  /** When the event begins, s. */
  at: number;
  /** Duration, s. */
  duration: number;
  /** Longitudinal position, m. */
  position: number;
  /** Lateral extent blocked, [yFrom, yTo] in m. */
  yFrom: number;
  yTo: number;
  active: boolean;
  done: boolean;
}

/** Physics timestep, s. Fixed and decoupled from render (CLAUDE.md §1.1). */
export const DT = 0.05;
