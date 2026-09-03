import { useMemo } from 'react';
import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World } from '../sim/types';

export interface TelemetryProps {
  worldRef: React.MutableRefObject<World | null>;
  scenario: Scenario;
  state: AppState;
  /** Bumped four times a second by the app. */
  tick: number;
}

/**
 * The live readout: clock, fleet, mean speed, motorcycle share.
 *
 * Four times a second, not sixty. Fast enough to feel live, slow enough that
 * React is not re-rendering the masthead on every frame — and slow enough to
 * be *read*, which a sixty-hertz number is not (DESIGN.md §5.0).
 *
 * The mean speed is the fleet's, not the detectors': this is what is happening,
 * not what an observer could measure. The instruments below are where the
 * difference between those two becomes the subject.
 */
export function Telemetry({ worldRef, scenario, state, tick }: TelemetryProps) {
  const readings = useMemo(() => {
    const world = worldRef.current;
    if (!world) return null;
    const n = world.vehicles.length;
    let sum = 0;
    let mc = 0;
    for (const v of world.vehicles) {
      sum += v.v;
      if (v.type === 'MC') mc++;
    }
    return {
      t: world.t,
      vehicles: n,
      meanSpeed: n > 0 ? (sum / n) * 3.6 : 0,
      mcShare: n > 0 ? (mc / n) * 100 : 0,
      // Density is the honest per-kilometre figure the fundamental diagram
      // plots against, stated here so the road view has a number beside it.
      density: (n / scenario.geometry.length) * 1000,
    };
    // tick is the dependency that matters: the world is a ref and mutates
    // without telling React.
  }, [worldRef, scenario, tick]);

  const clock = readings ? formatClock(readings.t) : '0:00';

  return (
    <dl className="telemetry" aria-label="Live readings">
      <div className={`telemetry__state${state.running ? ' telemetry__state--running' : ''}`}>
        <span className="telemetry__dot" aria-hidden="true" />
        <dt className="visually-hidden">Clock</dt>
        <dd className="telemetry__clock readout">{clock}</dd>
      </div>

      <Reading label="Vehicles" value={readings ? String(readings.vehicles) : '—'} />
      <Reading
        label="Mean speed"
        value={readings ? readings.meanSpeed.toFixed(1) : '—'}
        unit="km/h"
      />
      <Reading
        label="Density"
        value={readings ? readings.density.toFixed(0) : '—'}
        unit="veh/km"
      />
      <Reading
        label="Motorcycles"
        value={readings ? readings.mcShare.toFixed(0) : '—'}
        unit="%"
      />
    </dl>
  );
}

function Reading({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="telemetry__item">
      <dt className="label telemetry__label">{label}</dt>
      <dd className="telemetry__value readout">
        {value}
        {unit && <span className="telemetry__unit"> {unit}</span>}
      </dd>
    </div>
  );
}

/** Simulated time, mm:ss. Minutes matter here; hours never arrive. */
function formatClock(t: number): string {
  const total = Math.max(0, Math.floor(t));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
