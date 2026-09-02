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

  return (
    <aside className="params on-paper" aria-label="Parameters">
      <h2 className="params__title">Parameters</h2>

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
