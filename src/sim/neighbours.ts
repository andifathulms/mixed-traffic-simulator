import type { Geometry, Params, Vehicle } from './types';
import { forwardDistance } from './geometry';

/**
 * Cell size, m.
 *
 * Sized well below the interaction range rather than equal to it. A cell the
 * size of the range means every query scans the range in *both* directions —
 * five hundred metres of road to find a leader a car length ahead — and at the
 * densities the bottleneck scenario reaches that dominated the entire frame.
 */
export const CELL_SIZE = 25;

/** Interaction range, m. Beyond this a vehicle ahead does not constrain. */
export const INTERACTION_RANGE = 125;

const RANGE_CELLS = Math.ceil(INTERACTION_RANGE / CELL_SIZE);

/**
 * Uniform grid indexed by longitudinal position.
 *
 * Queries are directional and scan outward cell by cell, so they can stop as
 * soon as the nearest candidate found is closer than anything the next cell
 * could hold. In free flow that means one or two cells rather than the full
 * range.
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
    for (const v of vehicles) this.cells[this.cellOf(v.x)].push(v);
  }

  cellOf(x: number): number {
    const i = Math.floor(x / CELL_SIZE);
    if (this.geometry.ring) return ((i % this.cellCount) + this.cellCount) % this.cellCount;
    return Math.max(0, Math.min(this.cellCount - 1, i));
  }

  /** The cell `offset` cells from `from`, or -1 when it falls off an open road. */
  offsetCell(from: number, offset: number): number {
    const i = from + offset;
    if (this.geometry.ring) {
      // A ring shorter than the search range would wrap onto itself and return
      // the same cell twice, double-counting its vehicles.
      if (Math.abs(offset) >= this.cellCount) return -1;
      return ((i % this.cellCount) + this.cellCount) % this.cellCount;
    }
    if (i < 0 || i >= this.cellCount) return -1;
    return i;
  }

  cell(i: number): Vehicle[] {
    return this.cells[i];
  }

  get count(): number {
    return this.cellCount;
  }

  /**
   * Vehicles in the cell containing x and the `span` cells either side, written
   * into `out` and returned as a count.
   *
   * Used where the query is genuinely symmetric — lateral clearance and the
   * collision check. The caller supplies a reusable buffer so the hot path
   * allocates nothing.
   */
  near(x: number, span: number, out: Vehicle[]): number {
    const centre = this.cellOf(x);
    let n = 0;
    for (let d = -span; d <= span; d++) {
      const i = this.offsetCell(centre, d);
      if (i < 0) continue;
      const cell = this.cells[i];
      for (let k = 0; k < cell.length; k++) out[n++] = cell[k];
    }
    return n;
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
 * against every neighbour every step.
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

const EMPTY: LeaderQuery = { leader: null, gap: Infinity, effectiveGap: Infinity, dv: 0 };

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
  return directionalSearch(v, index, geometry, params, atY, true);
}

/** The nearest constraining vehicle behind `v`, at an optional probe offset. */
export function findFollower(
  v: Vehicle,
  index: SpatialIndex,
  geometry: Geometry,
  params: Params,
  atY: number = v.y,
): LeaderQuery {
  return directionalSearch(v, index, geometry, params, atY, false);
}

function directionalSearch(
  v: Vehicle,
  index: SpatialIndex,
  geometry: Geometry,
  params: Params,
  atY: number,
  forward: boolean,
): LeaderQuery {
  const startCell = index.cellOf(v.x);
  let best: Vehicle | null = null;
  let bestCentreGap = Infinity;
  let bestWeight = 1;

  for (let d = 0; d <= RANGE_CELLS; d++) {
    const i = index.offsetCell(startCell, forward ? d : -d);
    if (i < 0) break;

    const cell = index.cell(i);
    for (let k = 0; k < cell.length; k++) {
      const other = cell[k];
      if (other.id === v.id) continue;

      const weight = constraintWeight(
        overlapAt(atY, v.width, other.y, other.width),
        params,
      );
      if (weight === 0) continue;

      const centreGap = forward
        ? forwardDistance(v.x, other.x, geometry)
        : forwardDistance(other.x, v.x, geometry);
      // On an open road a non-positive distance is on the wrong side. On a
      // ring the wrap has already made every distance non-negative.
      if (centreGap <= 0 || centreGap > INTERACTION_RANGE) continue;

      if (centreGap < bestCentreGap) {
        bestCentreGap = centreGap;
        best = other;
        bestWeight = weight;
      }
    }

    // Nothing in a farther cell can be closer than that cell's near edge, so
    // once the best candidate is inside that bound the search is finished.
    // In free flow this exits after one or two cells.
    if (best) {
      const nextCellNearEdge = forward
        ? (startCell + d + 1) * CELL_SIZE - v.x
        : v.x - (startCell - d) * CELL_SIZE;
      if (bestCentreGap <= nextCellNearEdge) break;
    }
  }

  if (!best) return EMPTY;

  const gap = bestCentreGap - best.length / 2 - v.length / 2;
  return {
    leader: best,
    gap,
    // Dividing by the weight makes a partially-overlapping obstacle read as
    // further away, which is the graded constraint described above.
    effectiveGap: forward && bestWeight > 0 ? gap / bestWeight : gap,
    dv: forward ? v.v - best.v : best.v - v.v,
  };
}
