import type { Geometry, Params, Vehicle } from './types';
import { forwardDistance } from './geometry';

/** Interaction range, m. Cell size follows it (CLAUDE.md §3). */
export const CELL_SIZE = 100;

/**
 * Uniform grid indexed by longitudinal position.
 *
 * A naive O(n²) scan is fine at 400 vehicles but not at the densities the
 * bottleneck scenario reaches, where vehicles pile into a few hundred metres.
 */
export class SpatialIndex {
  private cells: Vehicle[][] = [];
  private cellCount = 0;
  private geometry!: Geometry;

  rebuild(vehicles: Vehicle[], geometry: Geometry): void {
    this.geometry = geometry;
    const count = Math.max(1, Math.ceil(geometry.length / CELL_SIZE));
    if (count !== this.cellCount) {
      this.cellCount = count;
      this.cells = Array.from({ length: count }, () => []);
    } else {
      for (const c of this.cells) c.length = 0;
    }
    for (const v of vehicles) {
      this.cells[this.cellOf(v.x)].push(v);
    }
  }

  private cellOf(x: number): number {
    const i = Math.floor(x / CELL_SIZE);
    if (this.geometry.ring) return ((i % this.cellCount) + this.cellCount) % this.cellCount;
    return Math.max(0, Math.min(this.cellCount - 1, i));
  }

  /**
   * Vehicles in the cell containing x and the `span` cells either side.
   * Yields rather than allocating, because this runs for every vehicle every step.
   */
  *near(x: number, span = 1): Generator<Vehicle> {
    const centre = this.cellOf(x);
    for (let d = -span; d <= span; d++) {
      let i = centre + d;
      if (this.geometry.ring) {
        i = ((i % this.cellCount) + this.cellCount) % this.cellCount;
      } else if (i < 0 || i >= this.cellCount) {
        continue;
      }
      for (const v of this.cells[i]) yield v;
    }
  }
}

/**
 * Lateral overlap between two footprints, as a fraction of the narrower width.
 *
 * The threshold above which this counts as constraining is a model parameter,
 * not a constant. A motorcycle half-overlapping a car's lane still constrains
 * it — partially — and how partially is the question the sublane rules answer.
 */
export function overlapFraction(a: Vehicle, b: Vehicle): number {
  return overlapAt(a.y, a.width, b.y, b.width);
}

/**
 * The same test on raw values, so a caller probing a hypothetical offset does
 * not have to allocate a vehicle-shaped object. This runs for every vehicle
 * against every neighbour every step, and at 400 vehicles the allocation
 * dominated the frame.
 */
export function overlapAt(yA: number, wA: number, yB: number, wB: number): number {
  const overlap = Math.min(yA + wA / 2, yB + wB / 2) - Math.max(yA - wA / 2, yB - wB / 2);
  if (overlap <= 0) return 0;
  return Math.min(1, overlap / Math.min(wA, wB));
}

/**
 * Graded constraint weight from an overlap fraction.
 *
 * Below the threshold a vehicle does not constrain at all. Above it, the
 * weight rises from 0 to 1 across the remaining range, raised to
 * `overlapExponent`. The effective gap seen by the follower is divided by this
 * weight, so a half-overlapping motorcycle reads as a more distant obstacle
 * than a fully-blocking car at the same distance — which is exactly the
 * behaviour that makes filtering work and that a lane model cannot express.
 */
export function constraintWeight(fraction: number, params: Params): number {
  if (fraction <= params.overlapThreshold) return 0;
  const t = (fraction - params.overlapThreshold) / (1 - params.overlapThreshold);
  return Math.pow(Math.min(1, t), params.overlapExponent);
}

export interface LeaderQuery {
  leader: Vehicle | null;
  /** Bumper-to-bumper gap to that leader, m; Infinity when there is none. */
  gap: number;
  /** Effective gap after the overlap weighting. */
  effectiveGap: number;
  /** Approach rate, m/s. Positive means closing. */
  dv: number;
}

/**
 * The nearest constraining vehicle ahead of `v`.
 *
 * Ahead is defined by forward distance, which on a ring wraps — so a vehicle
 * at position 5 correctly leads one at 225 on a 230 m ring.
 */
export function findLeader(
  v: Vehicle,
  index: SpatialIndex,
  geometry: Geometry,
  params: Params,
  /** Optional lateral offset to evaluate instead of the vehicle's own, for gap scoring. */
  atY: number = v.y,
): LeaderQuery {
  let best: Vehicle | null = null;
  let bestGap = Infinity;
  let bestWeight = 1;

  const searchSpan = Math.max(1, Math.ceil(120 / CELL_SIZE));

  for (const other of index.near(v.x, searchSpan)) {
    if (other.id === v.id) continue;
    const weight = constraintWeight(
      overlapAt(atY, v.width, other.y, other.width),
      params,
    );
    if (weight === 0) continue;

    const centreGap = forwardDistance(v.x, other.x, geometry);
    // On an open road a negative distance is behind; on a ring the wrap has
    // already made every distance non-negative, so this only filters open roads.
    if (centreGap <= 0) continue;
    const gap = centreGap - other.length / 2 - v.length / 2;
    if (gap < bestGap) {
      bestGap = gap;
      best = other;
      bestWeight = weight;
    }
  }

  if (!best) return { leader: null, gap: Infinity, effectiveGap: Infinity, dv: 0 };
  return {
    leader: best,
    gap: bestGap,
    // Dividing by the weight makes a partially-overlapping obstacle read as
    // further away, which is the graded constraint described above.
    effectiveGap: bestWeight > 0 ? bestGap / bestWeight : Infinity,
    dv: v.v - best.v,
  };
}

/** The nearest constraining vehicle behind `v`, at an optional probe offset. */
export function findFollower(
  v: Vehicle,
  index: SpatialIndex,
  geometry: Geometry,
  params: Params,
  atY: number = v.y,
): LeaderQuery {
  let best: Vehicle | null = null;
  let bestGap = Infinity;

  const searchSpan = Math.max(1, Math.ceil(120 / CELL_SIZE));

  for (const other of index.near(v.x, searchSpan)) {
    if (other.id === v.id) continue;
    if (constraintWeight(overlapAt(atY, v.width, other.y, other.width), params) === 0) continue;

    const centreGap = forwardDistance(other.x, v.x, geometry);
    if (centreGap <= 0) continue;
    const gap = centreGap - other.length / 2 - v.length / 2;
    if (gap < bestGap) {
      bestGap = gap;
      best = other;
    }
  }

  if (!best) return { leader: null, gap: Infinity, effectiveGap: Infinity, dv: 0 };
  return { leader: best, gap: bestGap, effectiveGap: bestGap, dv: best.v - v.v };
}
