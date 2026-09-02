import type { Geometry, Params, Vehicle } from '../types';
import type { SpatialIndex } from '../neighbours';

export interface LateralContext {
  index: SpatialIndex;
  geometry: Geometry;
  params: Params;
  t: number;
}

/** One candidate lateral offset and the gap it would afford. Shown in the inspector. */
export interface OffsetScore {
  y: number;
  score: number;
}

/**
 * The three lateral rules implement this one interface, so the app can switch
 * between them at runtime and show how much the answer depends on the choice
 * (PRD §4.3). The lateral rule is a modelling choice, not physics, and the
 * interface says so by carrying the citation.
 */
export interface LateralRule {
  name: string;
  /** Null for the social force rule — it has no traffic-literature basis. */
  citation: string | null;
  /** Lateral acceleration, m/s². The world integrates it and rate-limits vLat. */
  lateralAcceleration(v: Vehicle, ctx: LateralContext): number;
  /** Offsets considered this step, for the vehicle inspector. Optional. */
  offsetsConsidered?(v: Vehicle, ctx: LateralContext): OffsetScore[];
}
