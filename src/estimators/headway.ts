import type { DetectorRecord } from './detector-record';
import { headwayPairs } from './aggregate';
import type { EmpEstimate } from './types';

/**
 * Time headway method.
 *
 * The equivalence is the ratio of the mean headway a motorcycle takes to the
 * mean headway a light vehicle takes, following the same class of leader. A
 * motorcycle that follows in half the time a car does is worth half a car.
 *
 * Holding the leader class fixed matters. Headways behind a bus are longer for
 * everyone, so pooling across leaders measures the composition of the leaders
 * rather than the followers. The literature is not consistent on this and the
 * inconsistency is one reason published values differ.
 */
export function headwayEmp(
  records: readonly DetectorRecord[],
  interval: number,
): EmpEstimate {
  // The headway method reads successive crossings directly and never buckets
  // them, so the observation period is irrelevant to it. That difference is
  // itself worth noticing: it is the one method here the aggregation interval
  // cannot move, which is why it stays put on the bench while the others swing.
  const pairs = headwayPairs(records);
  const warnings: string[] = [];

  // Condition on an LV leader: the reference case.
  const mcFollowing = pairs.filter((p) => p.leader === 'LV' && p.follower === 'MC');
  const lvFollowing = pairs.filter((p) => p.leader === 'LV' && p.follower === 'LV');

  const sampleCount = mcFollowing.length + lvFollowing.length;

  if (mcFollowing.length < 5 || lvFollowing.length < 5) {
    warnings.push(
      `Too few following pairs behind a light vehicle: ${mcFollowing.length} ` +
        `motorcycle and ${lvFollowing.length} car followers. The method needs both ` +
        'and cannot be applied to this stream.',
    );
    return { method: 'Time headway', value: NaN, r2: null, sampleCount, interval, warnings };
  }

  const mean = (xs: typeof pairs) => xs.reduce((s, p) => s + p.headway, 0) / xs.length;
  const hMc = mean(mcFollowing);
  const hLv = mean(lvFollowing);

  if (hLv <= 0) {
    warnings.push('Mean car headway is zero. The detector recorded no separation.');
    return { method: 'Time headway', value: NaN, r2: null, sampleCount, interval, warnings };
  }

  const value = hMc / hLv;

  if (mcFollowing.length < 30 || lvFollowing.length < 30) {
    warnings.push(
      `Small sample: ${mcFollowing.length} motorcycle and ${lvFollowing.length} car ` +
        'followers. The ratio is unstable at this count.',
    );
  }
  if (value > 1) {
    warnings.push(
      'Motorcycles are following at longer headways than cars here, giving an ' +
        'equivalence above one. This happens when motorcycles are filtering rather ' +
        'than queueing, so the detector sees them arriving between platoons.',
    );
  }

  return { method: 'Time headway', value, r2: null, sampleCount, interval, warnings };
}
