import type {
  Params,
  Vehicle,
  VehicleType,
  World,
  Geometry,
  SimWarning,
  WarningKind,
} from './types';
import { DT } from './types';
import { idmAcceleration } from './idm';
import {
  wrapPosition,
  leftEdgeAt,
  rightEdgeAt,
  gradeAccelerationFactor,
  forwardDistance,
} from './geometry';
import { SpatialIndex, findLeader, overlapFraction } from './neighbours';
import { getLateralRule } from './lateral';
import { advanceSignal, signalConstraint } from './signal';
import { recordCrossings } from './detectors';
import { applyFriction, blockedWidthAt } from './friction';
import { admitArrivals } from './demand';

/** Reused across steps so a 60 fps loop does not allocate a grid per frame. */
const index = new SpatialIndex();

/**
 * Per-step working arrays, grown on demand and reused. Allocating three
 * Float64Arrays per step is a garbage collection pause every few seconds at
 * 20 steps per second, which shows up as a visible hitch in the road view.
 */
const floatPools: Float64Array[] = [];
function scratchFloats(n: number, slot: number): Float64Array {
  const existing = floatPools[slot];
  if (!existing || existing.length < n) {
    floatPools[slot] = new Float64Array(Math.max(n, 64));
  }
  return floatPools[slot];
}

/** Overlaps deeper than this are numerical noise rather than a genuine collision. */
const OVERLAP_TOLERANCE = 0.05;

export function addWarning(world: World, kind: WarningKind, message: string): void {
  const existing = world.warnings.find((w) => w.kind === kind && w.message === message);
  if (existing) {
    existing.count++;
    existing.t = world.t;
    return;
  }
  world.warnings.push({ kind, message, t: world.t, count: 1 });
  // Keep the list bounded — a pathological parameter set could otherwise
  // accumulate warnings until the tab runs out of memory.
  if (world.warnings.length > 40) world.warnings.shift();
}

/**
 * Advance the world by one fixed timestep.
 *
 * Pure in behaviour: the same world, params and RNG state produce the same next
 * world. Vehicles are mutated in place for performance, which is fine as long as
 * that property holds (CLAUDE.md §1).
 *
 * The order matters. Accelerations for every vehicle are computed against the
 * *current* state before any position is written, so the result does not depend
 * on the order vehicles happen to sit in the array. Updating in place while
 * iterating would make the simulation depend on array order, which is a subtle
 * determinism bug that only shows up once vehicles are sorted differently.
 */
export function step(world: World, dt: number, params: Params): World {
  const { geometry } = world;
  const rule = getLateralRule(params.lateralRule);

  index.rebuild(world.vehicles, geometry);
  const ctx = { index, geometry, params, t: world.t };

  advanceSignal(world, dt);
  applyFriction(world, dt, params);

  const decisionPeriod = Math.max(1, Math.round(params.lateralDecisionInterval / dt));
  const n = world.vehicles.length;
  const accel = scratchFloats(n, 0);
  const latAccel = scratchFloats(n, 1);
  const yPrevious = scratchFloats(n, 2);

  // Pass 1 — decide, reading only current state.
  for (let i = 0; i < n; i++) {
    const v = world.vehicles[i];

    const { leader, effectiveGap, gap, dv } = findLeader(v, index, geometry, params);

    // A red signal is a stationary obstacle at the stop line. Motorcycles use
    // the RHK stop line ahead of it when the box is enabled (PRD §4.4).
    const signalGap = signalConstraint(v, world);
    const useSignal = signalGap < effectiveGap;
    const constraintGap = useSignal ? signalGap : effectiveGap;
    const constraintDv = useSignal ? v.v : dv;

    const isHeavy = v.type === 'HV';
    const aMax = v.params.a * gradeAccelerationFactor(geometry.gradient, isHeavy);

    const terms = idmAcceleration(v.v, constraintDv, constraintGap, v.params, aMax);
    accel[i] = v.stopped ? Math.min(0, -v.v / dt) : terms.a;

    if (terms.clamped) {
      addWarning(
        world,
        'deceleration-clamp',
        'Deceleration clamped at 8 m/s² — a vehicle was forced into braking harder ' +
          'than is physical, which indicates a gap or parameter problem.',
      );
    }

    // Lateral decisions are staggered by vehicle id so the population does not
    // re-plan in lockstep, which would appear as a pulse in the lateral
    // distribution every few frames.
    if (decisionPeriod <= 1 || (world.step + v.id) % decisionPeriod === 0) {
      v.latAccelHeld = rule.lateralAcceleration(v, ctx);
    }
    latAccel[i] = v.latAccelHeld;

    // Cached for the vehicle inspector (DESIGN.md §5.8). Not read by the physics.
    v.leaderId = leader ? leader.id : null;
    v.freeTerm = terms.free;
    v.interactionTerm = terms.interaction;
    v.desiredGap = terms.desiredGap;
    v.currentGap = useSignal ? signalGap : gap;
  }

  // Pass 2 — integrate.
  for (let i = 0; i < n; i++) {
    const v = world.vehicles[i];

    v.a = accel[i];
    v.v += v.a * dt;
    // Vehicles do not reverse. Clamping here rather than in the IDM keeps the
    // model's returned acceleration honest for the inspector.
    if (v.v < 0) v.v = 0;

    const advance = v.v * dt;
    v.x = wrapPosition(v.x + advance, geometry);
    v.distance += advance;

    const yBefore = v.y;
    const maxLat = params.maxLateralSpeed[v.type];
    v.vLat = Math.max(-maxLat, Math.min(maxLat, v.vLat + latAccel[i] * dt));
    v.y += v.vLat * dt;

    // Vehicles cannot leave the carriageway. Roadside parking removes usable
    // width from the kerbside edge, which is side friction acting on geometry
    // rather than on a coefficient.
    const left = leftEdgeAt(v.x, geometry) + v.width / 2;
    const right =
      rightEdgeAt(v.x, geometry) - blockedWidthAt(v.x, world, params) - v.width / 2;
    if (right <= left) {
      v.y = (left + right) / 2;
      v.vLat = 0;
    } else if (v.y < left) {
      v.y = left;
      v.vLat = Math.max(0, v.vLat);
    } else if (v.y > right) {
      v.y = right;
      v.vLat = Math.min(0, v.vLat);
    }

    yPrevious[i] = yBefore;

    if (!Number.isFinite(v.x) || !Number.isFinite(v.v) || !Number.isFinite(v.y)) {
      addWarning(
        world,
        'nan',
        `Vehicle ${v.id} reached a non-finite state — the simulation is no longer ` +
          'numerically valid from this step onward.',
      );
      v.v = 0;
      v.vLat = 0;
    }
  }

  // Pass 3 — resolve lateral clearance.
  //
  // This cannot be folded into pass 2. Inside that loop some vehicles have
  // advanced and some have not, so whether two bodies count as alongside
  // depends on their array order: the vehicle processed first sees a stale
  // position for the second, decides they are not yet abreast, and moves
  // freely — leaving the second one to discover a conflict that is by then
  // unresolvable. Running it as its own pass gives every vehicle the same,
  // fully-updated view, so the constraint is symmetric.
  for (let i = 0; i < n; i++) {
    applyLateralClearance(world.vehicles[i], world, yPrevious[i]);
  }

  recordCrossings(world, dt);

  if (!geometry.ring) {
    removeDeparted(world);
    admitArrivals(world, dt, params);
  }

  world.t += dt;
  world.step++;

  checkOverlap(world, params);

  return world;
}

/** Vehicles leaving through the downstream boundary. Conservation is asserted in tests. */
function removeDeparted(world: World): void {
  const { length } = world.geometry;
  let write = 0;
  for (let i = 0; i < world.vehicles.length; i++) {
    const v = world.vehicles[i];
    if (v.x - v.length / 2 > length) {
      world.departed++;
      continue;
    }
    world.vehicles[write++] = v;
  }
  world.vehicles.length = write;
}

/**
 * Collisions are bugs (CLAUDE.md §1.5). In development this is an assertion; in
 * production it surfaces a numerical warning rather than rendering vehicles
 * inside each other.
 */
const clearanceScratch: Vehicle[] = [];

/**
 * Stop a vehicle drifting sideways into a body that is alongside it.
 *
 * Constraints from every neighbour are combined into one allowed interval
 * before anything moves. Resolving them one at a time does not work: pushing
 * clear of the vehicle on the left shoves this one into the vehicle on the
 * right, and which overlap survives then depends on array order.
 *
 * The lateral rules score offsets by the gap *ahead*, so on their own they will
 * happily walk a vehicle into one sitting beside it. Below the overlap
 * threshold the two do not constrain each other longitudinally either — which
 * is deliberate, and is exactly what lets a motorcycle filter — so nothing else
 * in the model prevents the intrusion.
 *
 * This is a physical constraint rather than a behavioural one: bodies do not
 * interpenetrate, whichever lateral rule is selected. It therefore lives here
 * and applies to all three, rather than being reimplemented in each.
 *
 * It only ever prevents clearance from getting worse. A vehicle already
 * marginally intruding is left where it is rather than being teleported apart,
 * because a teleport would be a larger lie than the overlap it fixed.
 */
function applyLateralClearance(v: Vehicle, world: World, yBefore: number): void {
  const { geometry } = world;
  const count = index.near(v.x, 1, clearanceScratch);

  let lo = -Infinity;
  let hi = Infinity;

  for (let i = 0; i < count; i++) {
    const other = clearanceScratch[i];
    if (other.id === v.id) continue;

    // Only bodies that are longitudinally alongside can be intruded upon.
    const separation = geometry.ring
      ? Math.min(
          forwardDistance(v.x, other.x, geometry),
          forwardDistance(other.x, v.x, geometry),
        )
      : Math.abs(v.x - other.x);
    if (separation >= (v.length + other.length) / 2) continue;

    const required = (v.width + other.width) / 2;
    // Which side of the neighbour this vehicle was on before it moved. Using
    // the pre-move position means a vehicle that has already crossed the
    // centreline of a neighbour is pushed back the way it came, rather than
    // being flipped to the far side.
    if (yBefore >= other.y) lo = Math.max(lo, other.y + required);
    else hi = Math.min(hi, other.y - required);
  }

  if (lo > hi) {
    // Squeezed from both sides — there is no legal position. Hold the previous
    // one rather than picking a side, which would push the vehicle into the
    // neighbour it was not already touching.
    v.y = yBefore;
    v.vLat = 0;
    return;
  }

  if (v.y < lo) {
    v.y = lo;
    if (v.vLat < 0) v.vLat = 0;
  } else if (v.y > hi) {
    v.y = hi;
    if (v.vLat > 0) v.vLat = 0;
  }
}

const overlapScratch: Vehicle[] = [];

function checkOverlap(world: World, params: Params): void {
  const { geometry } = world;
  for (const v of world.vehicles) {
    const count = index.near(v.x, 1, overlapScratch);
    for (let i = 0; i < count; i++) {
      const other = overlapScratch[i];
      if (other.id <= v.id) continue;
      // Test against the model's own threshold rather than a stricter one.
      //
      // Below `overlapThreshold` the model deliberately treats two footprints
      // as not constraining each other — that is the graded overlap rule, and
      // it is the mechanism by which a motorcycle filters past a car rather
      // than queueing behind it. Flagging a sub-threshold footprint intrusion
      // as a collision would report the model working as specified as a bug.
      //
      // Above the threshold the two do constrain each other, so any
      // interpenetration there is a genuine numerical failure.
      if (overlapFraction(v, other) <= params.overlapThreshold) continue;

      // On a ring both directions are non-negative and the nearer one is the
      // real separation. On an open road forwardDistance is signed, so taking
      // the minimum picks the negative one and reports a nonsense overlap of
      // the whole corridor length. Absolute difference is the open-road case.
      const separation = geometry.ring
        ? Math.min(forwardDistance(v.x, other.x, geometry), forwardDistance(other.x, v.x, geometry))
        : Math.abs(v.x - other.x);
      const required = (v.length + other.length) / 2;

      if (separation < required - OVERLAP_TOLERANCE) {
        addWarning(
          world,
          'overlap',
          `Vehicles ${v.id} and ${other.id} overlap longitudinally by ` +
            `${(required - separation).toFixed(2)} m — this is a numerical failure, ` +
            'not a simulated collision.',
        );
        return;
      }
    }
  }
}

export interface SpawnOptions {
  type: VehicleType;
  x: number;
  y: number;
  v: number;
}

/** Create a vehicle with per-vehicle jittered parameters (PRD §4.2). */
export function spawnVehicle(world: World, params: Params, opts: SpawnOptions): Vehicle {
  const cfg = params.types[opts.type];
  const { rng } = world;

  // Heterogeneity is what makes jams form. Identical drivers on a ring stay
  // in formation indefinitely, which is the wrong answer.
  const v0 = Math.max(2, cfg.idm.v0 * (1 + rng.normal(0, cfg.v0Jitter)));
  const T = Math.max(0.3, cfg.idm.T * (1 + rng.normal(0, cfg.tJitter)));

  const vehicle: Vehicle = {
    id: world.nextId++,
    type: opts.type,
    x: wrapPosition(opts.x, world.geometry),
    y: opts.y,
    v: opts.v,
    a: 0,
    vLat: 0,
    length: cfg.length,
    width: cfg.width,
    params: { ...cfg.idm, v0, T },
    entryTime: world.t,
    stopped: false,
    stoppedUntil: 0,
    distance: 0,
    lastDetectorIndex: -1,
    latAccelHeld: 0,
    leaderId: null,
    freeTerm: 0,
    interactionTerm: 0,
    desiredGap: cfg.idm.s0,
    currentGap: Infinity,
  };

  world.vehicles.push(vehicle);
  return vehicle;
}

export function createWorld(
  geometry: Geometry,
  rng: World['rng'],
  detectors: World['detectors'],
  signal: World['signal'] = null,
): World {
  return {
    t: 0,
    step: 0,
    vehicles: [],
    geometry,
    signal,
    detectors,
    rng,
    warnings: [] as SimWarning[],
    nextId: 1,
    departed: 0,
    unserved: 0,
    arrivalCredit: { MC: 0, LV: 0, HV: 0, PU: 0 },
    events: [],
  };
}

export { DT };
