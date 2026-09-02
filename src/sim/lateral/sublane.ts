import type { Vehicle } from '../types';
import { findLeader } from '../neighbours';
import { forwardDistance } from '../geometry';
import { leftEdgeAt, rightEdgeAt, wrapPosition } from '../geometry';
import type { LateralContext, LateralRule, OffsetScore } from './rule';

/**
 * How many offsets to sample either side of the current position.
 *
 * Three is enough to find the better side and commit to it; the decision
 * repeats several times a second, so the search is incremental rather than
 * exhaustive. Eleven samples cost three times as much and moved vehicles to
 * indistinguishable places.
 */
const SAMPLES = 3;
/** How far the vehicle looks laterally in one decision, m. */
const REACH = 1.6;
/** Gaps beyond this are all equally good; scoring saturates here. */
const GAP_SATURATION = 60;

/**
 * Lateral room a driver wants beyond bodies actually touching, m.
 *
 * Without it the rule treats a slot exactly one vehicle wide as being as good
 * as an open lane, so vehicles wedge themselves into gaps with millimetres to
 * spare. At a red light that packed four cars abreast across seven metres —
 * geometrically possible, behaviourally absurd, and the configuration the
 * clearance resolver then could not unpick. Drivers leave space beside them.
 */
const COMFORT_CLEARANCE = 0.35;

/** Reusable buffer for the bodies alongside a vehicle. */
const alongside: Vehicle[] = [];

/** How far ahead the road is checked for a narrowing, in seconds of travel. */
const LOOKAHEAD_SECONDS = 3;

function scoreOffsets(v: Vehicle, ctx: LateralContext): OffsetScore[] {
  const { geometry, params } = ctx;

  // The usable width is the narrowest the road gets between here and where
  // this vehicle will be shortly, not the width where it happens to be now.
  //
  // Without this the rule has no idea a bottleneck is coming: two vehicles run
  // abreast into a throat that fits only one, discover it at the moment they
  // arrive, and the clearance resolver is left choosing which of them to
  // overlap. A driver can see a narrowing road, and sorting into single file
  // before the throat rather than inside it is what actually happens.
  let left = leftEdgeAt(v.x, geometry) + v.width / 2;
  let right = rightEdgeAt(v.x, geometry) - v.width / 2;

  // Only worth sampling where the road actually varies. On a corridor of
  // constant width every sample returns the same two numbers, and paying for
  // them on every lateral decision of every vehicle tripled the step cost for
  // nothing.
  if (geometry.reductions.length > 0) {
    const ahead = Math.min(120, Math.max(10, v.v * LOOKAHEAD_SECONDS));
    const samples = 4;
    for (let i = 1; i <= samples; i++) {
      const x = wrapPosition(v.x + (ahead * i) / samples, geometry);
      left = Math.max(left, leftEdgeAt(x, geometry) + v.width / 2);
      right = Math.min(right, rightEdgeAt(x, geometry) - v.width / 2);
    }
  }

  // Where the road ahead is too narrow for this vehicle at any offset, aim for
  // the middle of what there is rather than reporting no options at all.
  if (right < left) {
    const middle = (left + right) / 2;
    left = middle;
    right = middle;
  }

  // Bodies close enough longitudinally to be beside this vehicle at any of the
  // offsets considered. Gathered once rather than per offset.
  let alongsideCount = 0;
  const nearCount = ctx.index.near(v.x, 1, alongside);
  for (let i = 0; i < nearCount; i++) {
    const other = alongside[i];
    if (other.id === v.id) continue;
    const separation = geometry.ring
      ? Math.min(
          forwardDistance(v.x, other.x, geometry),
          forwardDistance(other.x, v.x, geometry),
        )
      : Math.abs(v.x - other.x);
    if (separation >= (v.length + other.length) / 2) continue;
    alongside[alongsideCount++] = other;
  }

  const scores: OffsetScore[] = [];
  for (let i = -SAMPLES; i <= SAMPLES; i++) {
    const y = v.y + (REACH * i) / SAMPLES;
    if (y < left || y > right) continue;

    const { effectiveGap } = findLeader(v, ctx.index, geometry, params, y);
    const gap = Math.min(GAP_SATURATION, effectiveGap);

    // Without a centring preference vehicles chatter between two equally good
    // offsets and it looks broken. This is a preference for where they already
    // are, not a preference for the road centre.
    const cost = params.lateralCentring * Math.abs(y - v.y);

    // How cramped this offset would be. A slot with no room to spare is worth
    // less than an open one affording the same gap ahead.
    let squeeze = 0;
    for (let i = 0; i < alongsideCount; i++) {
      const other = alongside[i];
      const clearance =
        Math.abs(y - other.y) - (v.width + other.width) / 2 - COMFORT_CLEARANCE;
      if (clearance < 0) squeeze += -clearance;
    }

    scores.push({ y, score: gap / GAP_SATURATION - cost - squeeze });
  }
  return scores;
}

/**
 * Gap-seeking sublane rule.
 *
 * Vehicles sample lateral offsets within reach, score each by the longitudinal
 * gap it would afford, and move toward the best. This is what produces
 * motorcycle filtering: a narrow vehicle finds usable gaps a car cannot.
 */
export const sublaneRule: LateralRule = {
  name: 'Gap-seeking sublane',
  citation:
    'Sublane gap-seeking, in the family of continuous lateral models used for ' +
    'mixed traffic. There is no canonical lane-free model; the scoring function ' +
    'and its centring preference are choices made by this app.',

  offsetsConsidered: scoreOffsets,

  lateralAcceleration(v, ctx) {
    if (v.stopped) return -v.vLat * 4;

    const scores = scoreOffsets(v, ctx);
    if (scores.length === 0) return 0;

    let best = scores[0];
    for (const s of scores) if (s.score > best.score) best = s;

    const target = best.y - v.y;
    // Critically damped pull toward the target offset. The rate limit on vLat
    // lives in the world step, where it is applied per type.
    return 3.2 * target - 2.6 * v.vLat;
  },
};
