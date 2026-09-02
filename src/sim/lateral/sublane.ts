import type { Vehicle } from '../types';
import { findLeader } from '../neighbours';
import { leftEdgeAt, rightEdgeAt } from '../geometry';
import type { LateralContext, LateralRule, OffsetScore } from './rule';

/** How many offsets to sample either side of the current position. */
const SAMPLES = 5;
/** How far the vehicle looks laterally in one decision, m. */
const REACH = 1.6;
/** Gaps beyond this are all equally good; scoring saturates here. */
const GAP_SATURATION = 60;

function scoreOffsets(v: Vehicle, ctx: LateralContext): OffsetScore[] {
  const { geometry, params } = ctx;
  const left = leftEdgeAt(v.x, geometry) + v.width / 2;
  const right = rightEdgeAt(v.x, geometry) - v.width / 2;

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
    scores.push({ y, score: gap / GAP_SATURATION - cost });
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
