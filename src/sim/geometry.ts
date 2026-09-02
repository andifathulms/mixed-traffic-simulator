import type { Geometry, Vehicle } from './types';

/**
 * Longitudinal distance from `from` forward to `to`.
 *
 * A single function handles both open and ring cases so the ring scenario
 * cannot silently use open-road distance (CLAUDE.md §2).
 */
export function forwardDistance(from: number, to: number, geometry: Geometry): number {
  let d = to - from;
  if (geometry.ring) {
    const L = geometry.length;
    d = ((d % L) + L) % L;
  }
  return d;
}

/**
 * Bumper-to-bumper gap from follower to leader, m. Negative means overlap.
 * Both vehicles' half-lengths are removed, so this is the quantity IDM wants.
 */
export function gapTo(leader: Vehicle, follower: Vehicle, geometry: Geometry): number {
  const centreToCentre = forwardDistance(follower.x, leader.x, geometry);
  return centreToCentre - leader.length / 2 - follower.length / 2;
}

/** Wrap a position into the corridor. On an open road, positions are not wrapped. */
export function wrapPosition(x: number, geometry: Geometry): number {
  if (!geometry.ring) return x;
  const L = geometry.length;
  return ((x % L) + L) % L;
}

/**
 * Usable road width at a longitudinal position, accounting for reductions.
 * A reduction tapers linearly in and out across its span, which is what a
 * real lane closure looks like and what makes the bottleneck queue smooth.
 */
export function widthAt(x: number, geometry: Geometry): number {
  let w = geometry.width;
  for (const r of geometry.reductions) {
    const d = Math.abs(x - r.at);
    const half = r.span / 2;
    if (d >= half) continue;
    // Full severity in the central third, tapering over the outer thirds.
    const taper = Math.min(1, (1 - d / half) * 1.5);
    w -= r.severity * taper;
  }
  return Math.max(1.5, w);
}

/** Left edge of the usable carriageway at x, m. Reductions bite from the kerbside. */
export function leftEdgeAt(x: number, geometry: Geometry): number {
  return (geometry.width - widthAt(x, geometry)) * 0.5;
}

export function rightEdgeAt(x: number, geometry: Geometry): number {
  return leftEdgeAt(x, geometry) + widthAt(x, geometry);
}

/** Centre of marked lane `i`, m from the left edge. */
export function laneCentre(i: number, geometry: Geometry): number {
  const laneWidth = geometry.width / geometry.laneCount;
  return laneWidth * (i + 0.5);
}

export function nearestLane(y: number, geometry: Geometry): number {
  const laneWidth = geometry.width / geometry.laneCount;
  const i = Math.round(y / laneWidth - 0.5);
  return Math.max(0, Math.min(geometry.laneCount - 1, i));
}

/**
 * Gradient penalty on maximum acceleration.
 * Heavy vehicles lose far more on a grade than light ones, which is the whole
 * reason gradient is a capacity factor in MKJI.
 */
export function gradeAccelerationFactor(gradient: number, isHeavy: boolean): number {
  const sensitivity = isHeavy ? 12 : 3;
  return Math.max(0.15, 1 - gradient * sensitivity);
}
