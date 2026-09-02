import type { Vehicle } from '../types';
import { leftEdgeAt, rightEdgeAt, forwardDistance } from '../geometry';
import type { LateralRule } from './rule';

/** Repulsion from a road edge, m — edges push harder and over a shorter range. */
const EDGE_RANGE = 1.2;
const socialScratch: Vehicle[] = [];
const EDGE_STRENGTH = 6;

/**
 * Social force rule — repulsive potentials from neighbours and road edges,
 * adapted from pedestrian dynamics (Helbing and Molnár, 1995).
 *
 * This rule has NO traffic-literature basis. Its `citation` is null and the
 * interface renders that as a stated caveat rather than an empty field
 * (CLAUDE.md §4). It is here because it reproduces motorcycle swarming better
 * than the alternatives, and because the spread between the three rules is
 * itself one of the app's findings (PRD §7.1).
 */
export const socialRule: LateralRule = {
  name: 'Social force',
  citation: null,

  lateralAcceleration(v, ctx) {
    if (v.stopped) return -v.vLat * 4;

    const { geometry, params } = ctx;
    let force = 0;

    const count = ctx.index.near(v.x, 1, socialScratch);
    for (let i = 0; i < count; i++) {
      const other = socialScratch[i];
      if (other.id === v.id) continue;

      // Longitudinal separation gates the interaction: a vehicle 80 m ahead
      // exerts no lateral push, however close laterally.
      const ahead = forwardDistance(v.x, other.x, geometry);
      const behind = forwardDistance(other.x, v.x, geometry);
      const along = Math.min(ahead, behind);
      if (along > 25) continue;

      const dy = v.y - other.y;
      const clearance = Math.abs(dy) - (v.width + other.width) / 2;
      if (clearance > params.socialRange) continue;

      // Exponential repulsion, strongest at contact. The longitudinal taper
      // means a vehicle alongside pushes harder than one well ahead.
      const magnitude =
        params.socialStrength *
        Math.exp(-Math.max(0, clearance) / params.socialRange) *
        (1 - along / 25);

      // At exactly equal y the direction is undefined. Bias by id parity so
      // the tie breaks deterministically rather than through a random draw.
      const direction = dy === 0 ? (v.id % 2 === 0 ? 1 : -1) : Math.sign(dy);
      force += direction * magnitude;
    }

    const left = leftEdgeAt(v.x, geometry) + v.width / 2;
    const right = rightEdgeAt(v.x, geometry) - v.width / 2;
    force += EDGE_STRENGTH * Math.exp(-Math.max(0, v.y - left) / EDGE_RANGE);
    force -= EDGE_STRENGTH * Math.exp(-Math.max(0, right - v.y) / EDGE_RANGE);

    // Damping, without which the potential field oscillates indefinitely.
    return force - 2.2 * v.vLat;
  },
};
