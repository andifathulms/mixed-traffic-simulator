import { equilibriumGap } from '../../sim/idm';
import type { IdmParams } from '../../sim/types';

export interface FdPoint {
  /** Density, veh/km. */
  k: number;
  /** Flow, veh/h. */
  q: number;
  /** Space-mean speed, m/s. */
  v: number;
}

/**
 * The analytic IDM equilibrium curve.
 *
 * Overlaid on the accumulated cloud for comparison against what the simulation
 * actually produced. Where they diverge, that divergence is information — the
 * cloud is a heterogeneous, laterally mobile stream and the curve is a single
 * identical vehicle following another in one lane.
 */
export function equilibriumCurve(
  params: IdmParams,
  vehicleLength: number,
  /** How many lanes' worth of vehicles the road carries abreast. */
  effectiveLanes: number,
  samples = 60,
): FdPoint[] {
  const out: FdPoint[] = [];
  for (let i = samples; i >= 0; i--) {
    const v = (params.v0 * i) / samples;
    const gap = equilibriumGap(v, params);
    if (!Number.isFinite(gap)) continue;
    // Density is one vehicle per (gap + length), per lane.
    const k = (1000 / (gap + vehicleLength)) * effectiveLanes;
    out.push({ k, q: k * v * 3.6, v });
  }
  // The jam density point, where speed is zero and the gap is the minimum.
  const jamK = (1000 / (params.s0 + vehicleLength)) * effectiveLanes;
  out.push({ k: jamK, q: 0, v: 0 });
  return out.sort((a, b) => a.k - b.k);
}
