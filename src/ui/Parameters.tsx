import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World, VehicleType, ArrivalProcess } from '../sim/types';
import { VEHICLE_TYPES } from '../sim/types';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import type { SweepPointResult } from '../batch/protocol';
import { CITATIONS } from '../sim/defaults';
import { Citation } from './Citation';
import { TYPE_LABELS } from '../views/render/vehicle-shape';
import { detectorCsv, dischargeCsv, sweepCsv, download } from './csv';

export interface ParametersProps {
  state: AppState;
  scenario: Scenario;
  onChange: (patch: Partial<AppState>) => void;
  worldRef: React.MutableRefObject<World | null>;
  logRef: React.MutableRefObject<DetectorLog | null>;
  dischargeRecords: readonly DischargeRecord[];
  sweepPoints: readonly SweepPointResult[];
}

const ARRIVALS: Array<{ id: ArrivalProcess; label: string }> = [
  { id: 'poisson', label: 'Poisson' },
  { id: 'uniform', label: 'Uniform' },
  { id: 'platooned', label: 'Platooned' },
];

export function Parameters({
  state,
  scenario,
  onChange,
  logRef,
  dischargeRecords,
  sweepPoints,
}: ParametersProps) {
  const p = state.params;
  const set = (patch: Partial<typeof p>) => onChange({ params: { ...p, ...patch } });
  const setOverride = (patch: Partial<typeof state.overrides>) =>
    onChange({ overrides: { ...state.overrides, ...patch } });
  const geometry = scenario.geometry;

  return (
    <aside className="params on-paper" aria-label="Parameters">
      <h2 className="params__title">Parameters</h2>

      <section className="params__section">
        <h3>Geometry</h3>

        <label className="params__field">
          <span>
            Road width <span className="mono">{geometry.width.toFixed(1)} m</span>
          </span>
          <input
            type="range"
            min={25}
            max={200}
            value={Math.round(geometry.width * 10)}
            onChange={(e) => setOverride({ width: Number(e.target.value) / 10 })}
          />
          <small>
            Width, not lane count. Lanes are a marking and marking is optional.
            Changing the width rebuilds the run, because a road cannot widen
            under moving traffic without teleporting somebody.
          </small>
        </label>

        <label className="params__check">
          <input
            type="checkbox"
            checked={geometry.markings}
            onChange={(e) => setOverride({ markings: e.target.checked })}
          />
          <span>
            Lane markings
            <small>
              Only the strict-lane rule reads them. Under the other two,
              switching them off changes nothing — which is the point.
            </small>
          </span>
        </label>

        <label className="params__field">
          <span>
            Marked lanes <span className="mono">{geometry.laneCount}</span>
          </span>
          <input
            type="range"
            min={1}
            max={6}
            value={geometry.laneCount}
            onChange={(e) => setOverride({ laneCount: Number(e.target.value) })}
          />
        </label>

        <label className="params__field">
          <span>
            Gradient <span className="mono">{(geometry.gradient * 100).toFixed(1)}%</span>
          </span>
          <input
            type="range"
            min={-100}
            max={100}
            value={Math.round(geometry.gradient * 1000)}
            onChange={(e) => setOverride({ gradient: Number(e.target.value) / 1000 })}
          />
          <small>
            Heavy vehicles lose far more on a grade than light ones, which is
            why gradient is a capacity factor at all.
          </small>
        </label>

        {geometry.reductions.length > 0 && (
          <label className="params__field">
            <span>
              Bottleneck severity{' '}
              <span className="mono">
                {geometry.reductions[0].severity.toFixed(1)} m removed
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={Math.round((geometry.width - 2) * 10)}
              value={Math.round(geometry.reductions[0].severity * 10)}
              onChange={(e) =>
                setOverride({ bottleneckSeverity: Number(e.target.value) / 10 })
              }
            />
          </label>
        )}
      </section>

      {scenario.signal && (
        <section className="params__section">
          <h3>Signal</h3>

          <label className="params__check">
            <input
              type="checkbox"
              checked={scenario.signal.rhk}
              onChange={(e) => setOverride({ rhk: e.target.checked })}
            />
            <span>
              Ruang Henti Khusus
              <small>
                The advance motorcycle stop box. Without it motorcycles
                percolate to the front anyway and stop where they arrive; with
                it, they have a stop line of their own. The discharge plot
                measures both, and the app draws no conclusion between them.
              </small>
            </span>
          </label>

          <label className="params__field">
            <span>
              Cycle length <span className="mono">{scenario.signal.cycle} s</span>
            </span>
            <input
              type="range"
              min={30}
              max={180}
              value={scenario.signal.cycle}
              onChange={(e) => setOverride({ cycle: Number(e.target.value) })}
            />
          </label>

          <label className="params__field">
            <span>
              Green time <span className="mono">{scenario.signal.green} s</span>
            </span>
            <input
              type="range"
              min={5}
              max={150}
              value={scenario.signal.green}
              onChange={(e) => setOverride({ green: Number(e.target.value) })}
            />
            <small>
              Capped below the cycle so the controller always shows red — a
              green longer than its cycle would silently stop this being a
              signalised approach at all.
            </small>
          </label>
        </section>
      )}

      <section className="params__section">
        <h3>Demand</h3>

        <label className="params__field">
          <span>
            Inflow <span className="mono">{Math.round(p.inflow)} veh/h</span>
          </span>
          <input
            type="range"
            min={0}
            max={8000}
            step={100}
            value={p.inflow}
            onChange={(e) => set({ inflow: Number(e.target.value) })}
          />
        </label>

        <label className="params__field">
          <span>
            Heavy vehicles <span className="mono">{Math.round(p.hvShare * 100)}%</span> of
            non-motorcycles
          </span>
          <input
            type="range"
            min={0}
            max={40}
            value={Math.round(p.hvShare * 100)}
            onChange={(e) => set({ hvShare: Number(e.target.value) / 100 })}
          />
        </label>

        <label className="params__field">
          <span>
            Public transport <span className="mono">{Math.round(p.puShare * 100)}%</span> of
            non-motorcycles
          </span>
          <input
            type="range"
            min={0}
            max={50}
            value={Math.round(p.puShare * 100)}
            onChange={(e) => set({ puShare: Number(e.target.value) / 100 })}
          />
        </label>

        <fieldset className="params__radios">
          <legend>Arrival process</legend>
          {ARRIVALS.map((a) => (
            <label key={a.id}>
              <input
                type="radio"
                name="arrival"
                checked={p.arrival === a.id}
                onChange={() => set({ arrival: a.id })}
              />
              <span>{a.label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="params__section">
        <h3>
          Lateral model{' '}
          <Citation
            marker={state.lateralRule === 'social' ? 'no citation' : 'source'}
            text={
              state.lateralRule === 'social'
                ? CITATIONS.socialForce.text
                : CITATIONS.mobil.text
            }
          />
        </h3>

        <label className="params__field">
          <span>
            Overlap threshold <span className="mono">{p.overlapThreshold.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={90}
            value={Math.round(p.overlapThreshold * 100)}
            onChange={(e) => set({ overlapThreshold: Number(e.target.value) / 100 })}
          />
          <small>
            How much two footprints must overlap before the one in front
            constrains the one behind. This is a model parameter, not a
            constant — a motorcycle half in a car's path still constrains it,
            partially.
          </small>
        </label>

        <label className="params__field">
          <span>
            Overlap weighting exponent{' '}
            <span className="mono">{p.overlapExponent.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={10}
            max={400}
            value={Math.round(p.overlapExponent * 100)}
            onChange={(e) => set({ overlapExponent: Number(e.target.value) / 100 })}
          />
          <small>
            Above the threshold, the constraint rises from none to full across
            the remaining range, raised to this power. It materially changes
            filtering behaviour, so it is exposed rather than buried.
          </small>
        </label>

        <label className="params__field">
          <span>
            Lateral decision interval <span className="mono">{p.lateralDecisionInterval.toFixed(2)} s</span>
          </span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(p.lateralDecisionInterval * 100)}
            onChange={(e) => set({ lateralDecisionInterval: Number(e.target.value) / 100 })}
          />
          <small>
            How often a driver re-decides where to sit across the road. Braking
            is reactive and runs every timestep; choosing a lateral position is
            deliberate and does not.
          </small>
        </label>
      </section>

      <section className="params__section">
        <h3>
          Side friction <Citation marker="MKJI 1997" text={CITATIONS.sideFriction.text} />
        </h3>

        <label className="params__field">
          <span>
            Angkot stops <span className="mono">{p.friction.angkotStopRate}/h</span>
          </span>
          <input
            type="range"
            min={0}
            max={120}
            value={p.friction.angkotStopRate}
            onChange={(e) =>
              set({ friction: { ...p.friction, angkotStopRate: Number(e.target.value) } })
            }
          />
        </label>

        <label className="params__field">
          <span>
            Pedestrian crossings <span className="mono">{p.friction.pedestrianRate}/h</span>
          </span>
          <input
            type="range"
            min={0}
            max={200}
            value={p.friction.pedestrianRate}
            onChange={(e) =>
              set({ friction: { ...p.friction, pedestrianRate: Number(e.target.value) } })
            }
          />
        </label>

        <label className="params__field">
          <span>
            Roadside parking <span className="mono">{p.friction.parkingWidth.toFixed(1)} m</span>
          </span>
          <input
            type="range"
            min={0}
            max={30}
            value={Math.round(p.friction.parkingWidth * 10)}
            onChange={(e) =>
              set({
                friction: { ...p.friction, parkingWidth: Number(e.target.value) / 10 },
              })
            }
          />
        </label>
      </section>

      <section className="params__section">
        <h3>
          Vehicle dimensions{' '}
          <Citation marker="MKJI 1997" text={CITATIONS.mkjiDimensions.text} />
        </h3>
        <table className="params__table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Length, m</th>
              <th scope="col">Width, m</th>
              <th scope="col">v₀, km/h</th>
            </tr>
          </thead>
          <tbody>
            {VEHICLE_TYPES.map((t: VehicleType) => (
              <tr key={t}>
                <th scope="row">{TYPE_LABELS[t]}</th>
                <td>{p.types[t].length.toFixed(1)}</td>
                <td>{p.types[t].width.toFixed(1)}</td>
                <td>{(p.types[t].idm.v0 * 3.6).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="params__note">
          Free-flow speed for the speed ramp on this scenario is{' '}
          <span className="mono">{(scenario.rampSpeed * 3.6).toFixed(0)} km/h</span>. The
          ramp is normalised to it, so a 30 km/h scene and a 60 km/h scene do not
          look the same.
        </p>
      </section>

      <section className="params__section">
        <h3>Export</h3>
        <div className="params__buttons">
          <button
            type="button"
            onClick={() =>
              download('detector-records.csv', detectorCsv(logRef.current?.records ?? []))
            }
          >
            Detector records
          </button>
          <button
            type="button"
            disabled={dischargeRecords.length === 0}
            onClick={() => download('discharge.csv', dischargeCsv(dischargeRecords))}
          >
            Discharge
          </button>
          <button
            type="button"
            disabled={sweepPoints.length === 0}
            onClick={() => download('sweep.csv', sweepCsv(sweepPoints))}
          >
            Sweep
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            Copy link to this run
          </button>
        </div>
        <p className="params__note">
          Files are built in the browser. The app makes no network requests at
          runtime.
        </p>
      </section>
    </aside>
  );
}
