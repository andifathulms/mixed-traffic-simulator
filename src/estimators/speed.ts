import type { DetectorRecord } from './detector-record';
import { aggregate } from './aggregate';
import { ols } from './regression';
import type { EmpEstimate } from './types';

/**
 * Speed method.
 *
 * Space-mean speed is regressed on the composition of the stream:
 *
 *   V = a + c_MC·p_MC + c_HV·p_HV + c_PU·p_PU
 *
 * where p is each type's share of the interval. The equivalence follows from
 * how much each type depresses speed relative to a light vehicle: a type whose
 * presence slows the stream as much as a car is worth one car.
 *
 * The method assumes that consuming road space is what slows traffic and that
 * the relation is linear in composition. In motorcycle-dominated flow neither
 * assumption is safe — motorcycles filter, so adding them can raise the
 * measured spot-speed distribution rather than lowering it — and where that
 * happens this method reports an equivalence at or below zero. That is a
 * property of the method, and it is reported rather than hidden.
 */
export function speedEmp(
  records: readonly DetectorRecord[],
  interval: number,
  observedUntil?: number,
): EmpEstimate {
  const intervals = aggregate(records, interval, observedUntil).filter((i) => i.total >= 5);
  const warnings: string[] = [];

  if (intervals.length < 5) {
    warnings.push(
      `Only ${intervals.length} intervals carry enough crossings to give a speed. ` +
        'The regression is not identified.',
    );
    return {
      method: 'Speed',
      value: NaN,
      r2: null,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  const X = intervals.map((i) => [
    1,
    i.counts.MC / i.total,
    i.counts.HV / i.total,
    i.counts.PU / i.total,
  ]);
  const y = intervals.map((i) => i.spaceMeanSpeed);

  const fit = ols(X, y);
  if (!fit) {
    warnings.push(
      'The composition does not vary enough across intervals to separate the ' +
        'types. No coefficient can be recovered.',
    );
    return {
      method: 'Speed',
      value: NaN,
      r2: null,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  const [intercept, cMc] = fit.coefficients;

  // The free speed the fit implies for a stream of pure light vehicles.
  if (Math.abs(intercept) < 1e-9) {
    warnings.push('The fitted free speed is zero, so the equivalence has no scale.');
    return {
      method: 'Speed',
      value: NaN,
      r2: fit.r2,
      sampleCount: intervals.length,
      interval,
      warnings,
    };
  }

  // A motorcycle's share of the speed reduction, relative to the reduction a
  // full car stream would impose over the same range.
  const value = -cMc / intercept + 1;

  if (fit.illConditioned) {
    warnings.push(
      'Composition barely varies between intervals here, so the type coefficients ' +
        'are poorly determined.',
    );
  }
  if (value < 0) {
    warnings.push(
      'Negative equivalence — the fitted speed rises with motorcycle share. The ' +
        'method assumes every added vehicle slows the stream, and filtering ' +
        'motorcycles do not.',
    );
  }
  if (fit.r2 < 0.3) {
    warnings.push(
      `Composition explains only ${(fit.r2 * 100).toFixed(0)}% of the speed ` +
        'variation, so this coefficient is weakly supported.',
    );
  }

  return {
    method: 'Speed',
    value,
    r2: fit.r2,
    sampleCount: intervals.length,
    interval,
    warnings,
  };
}
