import type { Vehicle } from '../types';
import { findLeader, findFollower } from '../neighbours';
import { idmAcceleration } from '../idm';
import { laneCentre, nearestLane } from '../geometry';
import type { LateralContext, LateralRule, OffsetScore } from './rule';

/** MOBIL politeness — how much a lane changer weighs the follower's loss. */
const POLITENESS = 0.3;
/** Acceleration gain, m/s², below which a change is not worth making. */
const THRESHOLD = 0.2;
/** A change that would force the new follower to brake harder than this is unsafe. */
const SAFE_BRAKING = 4;

function accelerationIn(v: Vehicle, y: number, ctx: LateralContext): number {
  const { effectiveGap, dv } = findLeader(v, ctx.index, ctx.geometry, ctx.params, y);
  return idmAcceleration(v.v, dv, effectiveGap, v.params).a;
}

/**
 * Strict lanes with MOBIL lane changing (Kesting, Treiber and Helbing, 2007).
 *
 * The baseline that is wrong for Indonesia and right for comparison. Lateral
 * position snaps to lane centres; there is no continuous drift, and the lateral
 * occupancy chart consequently shows discrete spikes rather than a smear.
 */
export const lanesRule: LateralRule = {
  name: 'Strict lanes (MOBIL)',
  citation:
    'Kesting, Treiber and Helbing (2007), "General lane-changing model MOBIL for ' +
    'car-following models", Transportation Research Record 1999, 86–94. Lane ' +
    'discipline is assumed, which is the assumption this app is testing.',

  offsetsConsidered(v, ctx): OffsetScore[] {
    const lane = nearestLane(v.y, ctx.geometry);
    const out: OffsetScore[] = [];
    for (const target of [lane - 1, lane, lane + 1]) {
      if (target < 0 || target >= ctx.geometry.laneCount) continue;
      const y = laneCentre(target, ctx.geometry);
      out.push({ y, score: accelerationIn(v, y, ctx) });
    }
    return out;
  },

  lateralAcceleration(v, ctx) {
    const lane = nearestLane(v.y, ctx.geometry);
    const currentY = laneCentre(lane, ctx.geometry);
    let targetY = currentY;

    // Only consider a change when settled in a lane, so a vehicle mid-change
    // completes it rather than reversing.
    if (Math.abs(v.y - currentY) < 0.15 && !v.stopped) {
      const own = accelerationIn(v, currentY, ctx);
      let bestGain = THRESHOLD;

      for (const target of [lane - 1, lane + 1]) {
        if (target < 0 || target >= ctx.geometry.laneCount) continue;
        const y = laneCentre(target, ctx.geometry);

        const newFollower = findFollower(v, ctx.index, ctx.geometry, ctx.params, y);
        let followerAfter = 0;
        let followerBefore = 0;
        if (newFollower.leader) {
          const f = newFollower.leader;
          followerBefore = idmAcceleration(
            f.v,
            findLeader(f, ctx.index, ctx.geometry, ctx.params).dv,
            findLeader(f, ctx.index, ctx.geometry, ctx.params).effectiveGap,
            f.params,
          ).a;
          followerAfter = idmAcceleration(f.v, f.v - v.v, newFollower.gap, f.params).a;
          // Safety criterion: never force the new follower into hard braking.
          if (followerAfter < -SAFE_BRAKING) continue;
        }

        const gain =
          accelerationIn(v, y, ctx) - own + POLITENESS * (followerAfter - followerBefore);
        if (gain > bestGain) {
          bestGain = gain;
          targetY = y;
        }
      }
    } else if (!v.stopped) {
      targetY = currentY;
    }

    // Snap behaviour: a firm pull to the lane centre, so the distribution is
    // spikes rather than a spread.
    return 5.0 * (targetY - v.y) - 3.4 * v.vLat;
  },
};
