import type { DetectorRecord } from '../estimators';
import type { DischargeRecord } from '../sim/discharge';
import type { SweepPointResult } from '../batch/protocol';

/**
 * CSV export (PRD §9.9).
 *
 * Built as a Blob and downloaded locally. No network at runtime, so nothing is
 * uploaded anywhere to produce a file.
 */

function escape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join(
    '\n',
  );
}

export function download(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function detectorCsv(records: readonly DetectorRecord[]): string {
  return toCsv(
    [
      'detector',
      'crossing_time_s',
      'class',
      'spot_speed_ms',
      'occupancy_time_s',
      'lateral_position_m',
    ],
    records.map((r) => [
      r.detectorId,
      r.crossingTime.toFixed(3),
      r.vehicleClass,
      r.spotSpeed.toFixed(4),
      r.occupancyTime.toFixed(4),
      r.lateralPosition.toFixed(3),
    ]),
  );
}

export function dischargeCsv(records: readonly DischargeRecord[]): string {
  return toCsv(
    ['cycle', 'queue_position', 'headway_s', 'class', 'rhk'],
    records.map((r) => [
      r.cycleIndex,
      r.queuePosition,
      r.headway.toFixed(4),
      r.type,
      r.rhk ? 'on' : 'off',
    ]),
  );
}

export function sweepCsv(points: readonly SweepPointResult[]): string {
  return toCsv(
    [
      'swept_value',
      'mc_fraction',
      'truth_emp',
      'headway_emp',
      'regression_emp',
      'regression_r2',
      'speed_emp',
      'speed_r2',
      'occupancy_emp',
      'throughput_vehh',
    ],
    points.map((p) => [
      p.value,
      p.mcFraction,
      p.truth ?? '',
      Number.isFinite(p.headway.value) ? p.headway.value : '',
      Number.isFinite(p.regression.value) ? p.regression.value : '',
      p.regression.r2 ?? '',
      Number.isFinite(p.speed.value) ? p.speed.value : '',
      p.speed.r2 ?? '',
      Number.isFinite(p.occupancy.value) ? p.occupancy.value : '',
      Math.round(p.throughput),
    ]),
  );
}
