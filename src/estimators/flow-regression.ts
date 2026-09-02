import type { DetectorRecord } from './detector-record';
import { aggregate } from './aggregate';
import { ols } from './regression';
import type { EmpEstimate } from './types';

/**
 * Multiple linear regression of flow on counts by vehicle type.
 *
 * The model is
 *
 *   Q = b_LV·n_LV + b_MC·n_MC + b_HV·n_HV + b_PU·n_PU
 *
 * where Q is the flow in passenger car units. Q is not observable, so the
 * standard field substitute is to regress the interval's total occupancy or a
 * capacity proxy on the counts. This implementation regresses the interval's
 * summed occupancy time — the detector's own measure of how much road-time each
 * interval consumed — and normalises the motorcycle coefficient by the light
 * vehicle coefficient.
 *
 * This is the method that produced 0.11 at three minutes, 0.10 at fifteen and
 * −0.11 at one hour in the Denpasar study. The aggregation interval is the
 * whole story: as the window widens, the counts of the different types become
 * collinear — they all just track total demand — and the individual
 * coefficients stop being identified. The regression then puts an arbitrary
 * split on a shared effect, and the split can land below zero.
 *
 * A negative estimate is reported, not clamped (CLAUDE.md §6).
 */
export function regressionEmp(
  records: readonly DetectorRecord[],
  interval: number,
  observedUntil?: number,
): EmpEstimate {
  const intervals = aggregate(records, interval, observedUntil).filter((i) => i.total > 0);
  const warnings: string[] = [];

  if (intervals.length < 5) {
    warnings.push(
      `Only ${intervals.length} complete ${Math.round(interval / 60)}-minute intervals ` +
        'are available. A regression on this few points is not identified.',
    );
    return {
      method: 'Regression',
      value: NaN,
      r2: null,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  const X = intervals.map((i) => [
    i.counts.LV,
    i.counts.MC,
    i.counts.HV,
    i.counts.PU,
  ]);
  const y = intervals.map((i) => i.occupiedTime);

  const fit = ols(X, y);
  if (!fit) {
    warnings.push(
      'The regression design is rank-deficient at this interval — the type counts ' +
        'carry no independent variation and no coefficient can be recovered.',
    );
    return {
      method: 'Regression',
      value: NaN,
      r2: null,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  const [bLv, bMc] = fit.coefficients;

  if (Math.abs(bLv) < 1e-9) {
    warnings.push(
      'The light vehicle coefficient is effectively zero, so the ratio that defines ' +
        'the equivalence has no denominator at this interval.',
    );
    return {
      method: 'Regression',
      value: NaN,
      r2: fit.r2,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  const value = bMc / bLv;
  const minutes = Math.round(interval / 60);

  if (fit.illConditioned) {
    warnings.push(
      `The type counts are nearly collinear at ${minutes}-minute aggregation, so the ` +
        'coefficients are poorly determined and the split between them is arbitrary.',
    );
  }
  if (value < 0) {
    warnings.push(
      `Negative equivalence at ${minutes}-minute aggregation — the regression is not ` +
        'applicable at this interval. A vehicle cannot consume negative road space; ' +
        'the coefficient has lost its meaning, not found a new one.',
    );
  }
  if (fit.r2 < 0.5) {
    warnings.push(
      `The fit explains only ${(fit.r2 * 100).toFixed(0)}% of the variation, so the ` +
        'coefficients carry little information.',
    );
  }

  return {
    method: 'Regression',
    value,
    r2: fit.r2,
    sampleCount: intervals.length,
    interval,
    warnings,
  };
}
