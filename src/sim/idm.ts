import type { IdmParams } from './types';

/** Hardest deceleration treated as physical. Beyond this is a parameter problem. */
export const MAX_DECELERATION = 8;

/** Gaps below this are clamped before dividing — a zero gap yields a NaN cascade. */
const MIN_GAP = 0.1;

export interface IdmTerms {
  /** a·[1 − (v/v0)^δ] — what the driver would do on an empty road. */
  free: number;
  /** The constraint imposed by the leader: −a·(s-star / s)². */
  interaction: number;
  /** Desired gap s-star, m. */
  desiredGap: number;
  /** Resulting acceleration after clamping, m/s². */
  a: number;
  /** True when the clamp bound the result, so the caller can warn. */
  clamped: boolean;
}

/**
 * Intelligent Driver Model (Treiber, Hennecke & Helbing, 2000).
 *
 *   s-star = s0 + max(0, v·T + v·Δv / (2·√(a·b)))
 *   a      = a·[ 1 − (v/v0)^δ − (s-star / s)² ]
 *
 * The two terms are returned separately because the vehicle inspector shows them
 * as signed bars summing to the result (DESIGN.md §5.8) — that decomposition is
 * the app's "show your work" view, not a debugging aid.
 *
 * @param v      follower speed, m/s
 * @param dv     approach rate v − vLeader, m/s; positive means closing
 * @param s      bumper-to-bumper gap, m; Infinity when there is no leader
 * @param aMax   maximum acceleration after any gradient penalty, m/s²
 */
export function idmAcceleration(
  v: number,
  dv: number,
  s: number,
  p: IdmParams,
  aMax: number = p.a,
): IdmTerms {
  const free = aMax * (1 - Math.pow(Math.max(0, v) / p.v0, p.delta));

  let desiredGap = p.s0;
  let interaction = 0;

  if (Number.isFinite(s)) {
    const dynamic = (v * dv) / (2 * Math.sqrt(p.a * p.b));
    desiredGap = p.s0 + Math.max(0, v * p.T + dynamic);
    const safeS = Math.max(MIN_GAP, s);
    const ratio = desiredGap / safeS;
    interaction = -aMax * ratio * ratio;
  }

  const raw = free + interaction;
  const a = Math.max(-MAX_DECELERATION, Math.min(aMax, raw));

  return { free, interaction, desiredGap, a, clamped: raw < -MAX_DECELERATION };
}

/**
 * Closed-form equilibrium gap at a steady speed: the gap at which acceleration
 * is exactly zero with Δv = 0. This is the app's exact test (PRD §6.1) — a
 * simulated steady state must reproduce it to floating-point tolerance.
 */
export function equilibriumGap(v: number, p: IdmParams): number {
  const free = 1 - Math.pow(v / p.v0, p.delta);
  if (free <= 0) return Infinity;
  const sStar = p.s0 + v * p.T;
  return sStar / Math.sqrt(free);
}

/**
 * Inverse of the above: the steady speed sustained at a given gap.
 * Solved by bisection because the closed form does not invert analytically for
 * arbitrary δ. Used to seed the ring scenario exactly at equilibrium.
 */
export function equilibriumSpeed(gap: number, p: IdmParams): number {
  let lo = 0;
  let hi = p.v0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (equilibriumGap(mid, p) > gap) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
