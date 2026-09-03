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

/**
 * Lateral shortfall, m, above which a vehicle counts as having nowhere to go.
 * Below it the conflict is transient jostling and is resolved without comment.
 */
const SQUEEZE_TOLERANCE = 0.25;

/** Speed a vehicle with nowhere to go laterally settles to, m/s. */
const SQUEEZE_CRAWL_SPEED = 1.5;

/** Sweeps of the lateral clearance resolver per step. See the call site. */
const CLEARANCE_PASSES = 3;

/** Sweeps of the symmetric overlap relaxation. See relaxOverlaps. */
const RELAX_PASSES = 8;

/** Penetration below this is left alone; chasing it would never converge. */
const RELAX_TOLERANCE = 0.01;

/** Overlaps deeper than this are numerical noise rather than a genuine collision. */
const OVERLAP_TOLERANCE = 0.05;

/**
 * Record a warning, folding repeats of the same event into one entry.
 *
 * `key` identifies the event — a pair of vehicles, a detector, a parameter.
 * Where the warning has a magnitude, `severity` carries it, and the message is
 * replaced when a worse instance turns up, so the reader sees the worst case
 * once rather than every case in sequence.
 */
export function addWarning(
  world: World,
  kind: WarningKind,
  message: string,
  key = message,
  severity = 0,
): void {
  const existing = world.warnings.find((w) => w.kind === kind && w.key === key);
  if (existing) {
    existing.count++;
    existing.t = world.t;
    if (severity > existing.severity) {
      existing.severity = severity;
      existing.message = message;
    }
    return;
  }
  world.warnings.push({ kind, message, key, severity, t: world.t, count: 1 });
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

    // A vehicle that could find no legal lateral position on the previous step
    // slows to a crawl. Without this the model has no response at all to
    // running out of width: two vehicles enter a narrowing throat abreast,
    // discover there is no room for both, and the clearance resolver can only
    // choose which of them to overlap. Slowing is what a driver does, and it
    // is the only response that resolves the geometry rather than
    // redistributing the violation.
    //
    // A crawl rather than a stop, and deliberately so. Braking to zero
    // livelocks: a stopped vehicle in a throat is still squeezed, so it brakes
    // again on the next step and nothing ever clears. Creeping lets the
    // geometry resolve itself, which is also what happens at a real pinch
    // point — traffic does not halt permanently, it files through slowly.
    if (v.squeezed && !v.stopped) {
      accel[i] = Math.min(accel[i], (SQUEEZE_CRAWL_SPEED - v.v) / 1.5);
    }

    if (terms.clamped) {
      addWarning(
        world,
        'deceleration-clamp',
        'Deceleration clamped at 8 m/s². A vehicle was forced into braking harder ' +
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

    yPrevious[i] = yBefore;

    if (!Number.isFinite(v.x) || !Number.isFinite(v.v) || !Number.isFinite(v.y)) {
      addWarning(
        world,
        'nan',
        `Vehicle ${v.id} reached a non-finite state. The simulation is no longer ` +
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
  // Iterated, because clearance is a multi-body problem. One vehicle pinned
  // against the kerb, a second squeezed against it and a third crowding the
  // second cannot all be satisfied in a single sweep: relieving the middle one
  // depends on the outer one having already moved. Three sweeps resolve the
  // chains that occur in practice, and each is cheap — this pass is a small
  // fraction of the cost of the leader search.
  for (let pass = 0; pass < CLEARANCE_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      applyLateralClearance(world.vehicles[i], world, params, yPrevious[i]);
    }
  }

  relaxOverlaps(world, params);

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
function applyLateralClearance(
  v: Vehicle,
  world: World,
  params: Params,
  yBefore: number,
): void {
  const { geometry } = world;
  const count = index.near(v.x, 1, clearanceScratch);

  // The carriageway edges are constraints of exactly the same kind as a
  // neighbour's body, so they belong in the same interval. Clamping to the road
  // first and resolving neighbours afterwards lets the second pass push a
  // vehicle back off the road, which is what happened.
  //
  // Roadside parking removes usable width from the kerbside edge — side
  // friction acting on the geometry rather than on a coefficient.
  let lo = leftEdgeAt(v.x, geometry) + v.width / 2;
  let hi =
    rightEdgeAt(v.x, geometry) - blockedWidthAt(v.x, world, params) - v.width / 2;

  // Whether any body this vehicle is competing for width with is ahead of it.
  // This is what breaks the symmetry when two vehicles cannot both fit: see
  // the squeeze handling below.
  let conflictAhead = false;

  // The deepest single intrusion, and the position that would clear it. When
  // no position satisfies everything, this is the one that gets satisfied.
  let worstDepth = 0;
  let worstTarget = v.y;

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

    const depth = required - Math.abs(v.y - other.y);
    if (depth > 0) {
      const ahead = geometry.ring
        ? forwardDistance(v.x, other.x, geometry) < geometry.length / 2
        : other.x > v.x;
      if (ahead) conflictAhead = true;

      if (depth > worstDepth) {
        worstDepth = depth;
        const side = yBefore >= other.y ? 1 : -1;
        worstTarget = other.y + side * required;
      }
    }
  }

  // Only a substantial conflict counts as being squeezed, and only the vehicle
  // behind yields.
  //
  // With both parties crawling, two vehicles that entered a throat abreast
  // stayed abreast indefinitely: neither could pass, the resolver could only
  // split the overlap between them, and they travelled the rest of the
  // corridor interpenetrated. Somebody has to give way, and the one behind is
  // the one who does — which is both how a merge works and the only choice
  // that leaves the pair able to file through.
  //
  // In dense traffic the interval inverts constantly by a centimetre or two as
  // vehicles jostle, and treating every one of those as a squeeze made every
  // vehicle crawl, which raised the density, which produced more squeezes. The
  // corridor gridlocked at nine hundred vehicles with a third of the
  // throughput. A marginal inversion is resolved silently by splitting the
  // difference; only a real shortfall — a throat that genuinely will not take
  // two vehicles — slows anyone down.
  v.squeezed = lo - hi > SQUEEZE_TOLERANCE && conflictAhead;

  if (lo > hi) {
    // No position satisfies every constraint. Clear the deepest intrusion
    // rather than splitting the shortfall between them.
    //
    // Splitting looked fairer and was worse: it left every violation alive at
    // half depth, and two vehicles stuck inside each other in a queue — where
    // there is no relative motion to separate them — stayed that way for the
    // rest of the corridor. Satisfying the worst one drives the deepest
    // overlap to zero on each of the passes below, so the pair unwinds even
    // at a standstill. Shallower conflicts survive a step or two longer, which
    // is what the crawl above buys time for.
    //
    // The road edge is a hard bound and wins outright: a vehicle may briefly
    // graze a neighbour, but it may not leave the carriageway.
    const roadLo = leftEdgeAt(v.x, geometry) + v.width / 2;
    const roadHi =
      rightEdgeAt(v.x, geometry) - blockedWidthAt(v.x, world, params) - v.width / 2;
    v.y = roadHi <= roadLo
      ? (roadLo + roadHi) / 2
      : Math.min(Math.max(worstTarget, roadLo), roadHi);
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

const relaxScratch: Vehicle[] = [];

/**
 * Symmetric pairwise separation of bodies that still overlap.
 *
 * The interval resolver above moves one vehicle against neighbours it treats
 * as fixed. Every vehicle doing that independently can cancel out: two
 * motorcycles at the same offset each compute that the other should be the one
 * to move, and neither does. In a dense stopped swarm — a queue at a red
 * light, which is precisely the regime this app is about — there is also no
 * relative motion to shake them apart, so a pair that ends up interpenetrated
 * stays that way.
 *
 * This pass pushes both halves of each overlapping pair apart by half the
 * penetration, which is the standard relaxation for exactly this problem and,
 * unlike the interval clamp, is guaranteed to reduce total penetration on
 * every iteration. Road edges still bound the result, so a vehicle pinned
 * against the kerb pushes its neighbour the whole way instead.
 */
function relaxOverlaps(world: World, params: Params): void {
  const { geometry } = world;

  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    let moved = false;

    for (const v of world.vehicles) {
      const count = index.near(v.x, 1, relaxScratch);
      for (let i = 0; i < count; i++) {
        const other = relaxScratch[i];
        // Each pair is visited once, by the vehicle with the lower id.
        if (other.id <= v.id) continue;

        const separation = geometry.ring
          ? Math.min(
              forwardDistance(v.x, other.x, geometry),
              forwardDistance(other.x, v.x, geometry),
            )
          : Math.abs(v.x - other.x);
        if (separation >= (v.length + other.length) / 2) continue;

        const required = (v.width + other.width) / 2;
        const dy = v.y - other.y;
        const penetration = required - Math.abs(dy);
        if (penetration <= RELAX_TOLERANCE) continue;

        // At identical offsets the direction is undefined; break the tie on id
        // parity so the result stays deterministic.
        const direction = dy === 0 ? (v.id % 2 === 0 ? 1 : -1) : Math.sign(dy);
        const shift = (penetration / 2) * direction;

        // Half each, then whatever one of them could not take is passed to the
        // other. A bus already against the kerb absorbs its half by not moving
        // at all, and without this the pair would converge at half rate — or
        // not at all once the free vehicle also ran out of room.
        const vBefore = v.y;
        const otherBefore = other.y;
        v.y = clampToRoad(v.y + shift, v, world, params);
        other.y = clampToRoad(other.y - shift, other, world, params);

        const vShortfall = shift - (v.y - vBefore);
        const otherShortfall = -shift - (other.y - otherBefore);
        if (Math.abs(vShortfall) > 1e-9) {
          other.y = clampToRoad(other.y - vShortfall, other, world, params);
        }
        if (Math.abs(otherShortfall) > 1e-9) {
          v.y = clampToRoad(v.y - otherShortfall, v, world, params);
        }

        moved = true;
      }
    }

    if (!moved) break;
  }
}

function clampToRoad(y: number, v: Vehicle, world: World, params: Params): number {
  const lo = leftEdgeAt(v.x, world.geometry) + v.width / 2;
  const hi =
    rightEdgeAt(v.x, world.geometry) - blockedWidthAt(v.x, world, params) - v.width / 2;
  if (hi <= lo) return (lo + hi) / 2;
  return Math.min(Math.max(y, lo), hi);
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
        // One entry per pair, reporting the deepest overlap seen. The same
        // pair drifting apart over three steps is one event, not three.
        const depth = required - separation;
        const pair = v.id < other.id ? `${v.id}-${other.id}` : `${other.id}-${v.id}`;
        addWarning(
          world,
          'overlap',
          `Vehicles ${v.id} and ${other.id} overlap longitudinally by up to ` +
            `${depth.toFixed(2)} m. This is a numerical failure, ` +
            'not a simulated collision.',
          `overlap:${pair}`,
          depth,
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
    squeezed: false,
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
