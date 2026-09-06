import { useState } from 'react';
import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World, VehicleType, ArrivalProcess } from '../sim/types';
import { VEHICLE_TYPES } from '../sim/types';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import type { SweepPointResult } from '../batch/protocol';
import { CITATIONS } from '../sim/defaults';
import { Citation } from './Citation';
import { Card, Slider, Toggle } from './Field';
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

/**
 * The parameters panel.
 *
 * It used to be one column, twenty-two controls tall, which meant the only way
 * to find the gradient was to scroll past the signal. It is now a grid of
 * grouped plates that reflows to the width available, with a header that says
 * how many settings differ from the scenario's own and offers to put them back
 * (DESIGN.md §4.7).
 *
 * It also collapses. The instruments above it are the point of the app; the
 * knobs are how you interrogate them, and a reader who is done adjusting should
 * be able to get the knobs out of the way.
 */
export function Parameters({
  state,
  scenario,
  onChange,
  logRef,
  dischargeRecords,
  sweepPoints,
}: ParametersProps) {
  const [open, setOpen] = useState(true);
  const p = state.params;
  const set = (patch: Partial<typeof p>) => onChange({ params: { ...p, ...patch } });
  const setOverride = (patch: Partial<typeof state.overrides>) =>
    onChange({ overrides: { ...state.overrides, ...patch } });
  const geometry = scenario.geometry;

  const overridden = Object.values(state.overrides).filter((v) => v !== null).length;

  return (
    <aside className="params on-paper" aria-label="Parameters">
      <div className="params__head">
        <button
          type="button"
          className="params__disclosure"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`params__chevron${open ? ' params__chevron--open' : ''}`} aria-hidden="true" />
          <h2 className="params__title">Parameters</h2>
        </button>

        {overridden > 0 && (
          <>
            <span className="chip">
              {overridden} changed from {scenario.name}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onChange({
                  overrides: {
                    width: null,
                    markings: null,
                    laneCount: null,
                    gradient: null,
                    bottleneckSeverity: null,
                    rhk: null,
                    green: null,
                    cycle: null,
                  },
                })
              }
            >
              Restore scenario
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="params__grid">
          <Card title="Geometry">
            <Slider
              label="Road width"
              value={`${geometry.width.toFixed(1)} m`}
              min={25}
              max={200}
              raw={Math.round(geometry.width * 10)}
              onChange={(n) => setOverride({ width: n / 10 })}
              hint="Width, not lane count. Lanes are a marking and marking is optional. Changing the width rebuilds the run, because a road cannot widen under moving traffic without teleporting somebody."
            />

            <Toggle
              label="Lane markings"
              checked={geometry.markings}
              onChange={(checked) => setOverride({ markings: checked })}
              hint="Only the strict-lane rule reads them. Under the other two, switching them off changes nothing, which is the point."
            />

            <Slider
              label="Marked lanes"
              value={String(geometry.laneCount)}
              min={1}
              max={6}
              raw={geometry.laneCount}
              onChange={(n) => setOverride({ laneCount: n })}
            />

            <Slider
              label="Gradient"
              value={`${(geometry.gradient * 100).toFixed(1)}%`}
              min={-100}
              max={100}
              raw={Math.round(geometry.gradient * 1000)}
              onChange={(n) => setOverride({ gradient: n / 1000 })}
              hint="Heavy vehicles lose far more on a grade than light ones, which is why gradient is a capacity factor at all."
            />

            {geometry.reductions.length > 0 && (
              <Slider
                label="Bottleneck severity"
                value={`${geometry.reductions[0].severity.toFixed(1)} m removed`}
                min={0}
                max={Math.round((geometry.width - 2) * 10)}
                raw={Math.round(geometry.reductions[0].severity * 10)}
                onChange={(n) => setOverride({ bottleneckSeverity: n / 10 })}
              />
            )}
          </Card>

          {scenario.signal && (
            <Card title="Signal">
              <Toggle
                label="Ruang Henti Khusus"
                checked={scenario.signal.rhk}
                onChange={(checked) => setOverride({ rhk: checked })}
                hint="The advance motorcycle stop box. Without it motorcycles percolate to the front anyway and stop where they arrive; with it, they have a stop line of their own. The discharge plot measures both, and the app draws no conclusion between them."
              />

              <Slider
                label="Cycle length"
                value={`${scenario.signal.cycle} s`}
                min={30}
                max={180}
                raw={scenario.signal.cycle}
                onChange={(n) => setOverride({ cycle: n })}
              />

              <Slider
                label="Green time"
                value={`${scenario.signal.green} s`}
                min={5}
                max={150}
                raw={scenario.signal.green}
                onChange={(n) => setOverride({ green: n })}
                hint="Capped below the cycle so the controller always shows red. A green longer than its cycle would silently stop this being a signalised approach at all."
              />
            </Card>
          )}

          <Card title="Demand">
            <Slider
              label="Inflow"
              value={`${Math.round(p.inflow)} veh/h`}
              min={0}
              max={8000}
              step={100}
              raw={p.inflow}
              onChange={(n) => set({ inflow: n })}
            />

            <Slider
              label="Heavy vehicles"
              value={`${Math.round(p.hvShare * 100)}% of non-motorcycles`}
              min={0}
              max={40}
              raw={Math.round(p.hvShare * 100)}
              onChange={(n) => set({ hvShare: n / 100 })}
            />

            <Slider
              label="Public transport"
              value={`${Math.round(p.puShare * 100)}% of non-motorcycles`}
              min={0}
              max={50}
              raw={Math.round(p.puShare * 100)}
              onChange={(n) => set({ puShare: n / 100 })}
            />

            <fieldset className="pfield pradios">
              <legend className="pfield__label">Arrival process</legend>
              <div className="segmented">
                {ARRIVALS.map((a) => (
                  <label key={a.id} className="segmented__item">
                    <input
                      type="radio"
                      name="arrival"
                      checked={p.arrival === a.id}
                      onChange={() => set({ arrival: a.id })}
                    />
                    <span>{a.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card
            title={
              <>
                Lateral model{' '}
                <Citation
                  marker={state.lateralRule === 'social' ? 'no citation' : 'source'}
                  text={
                    state.lateralRule === 'social'
                      ? CITATIONS.socialForce.text
                      : CITATIONS.mobil.text
                  }
                />
              </>
            }
          >
            <Slider
              label="Overlap threshold"
              value={p.overlapThreshold.toFixed(2)}
              min={0}
              max={90}
              raw={Math.round(p.overlapThreshold * 100)}
              onChange={(n) => set({ overlapThreshold: n / 100 })}
              hint="How much two footprints must overlap before the one in front constrains the one behind. This is a model parameter, not a constant: a motorcycle half in a car's path still constrains it, partially."
            />

            <Slider
              label="Overlap weighting exponent"
              value={p.overlapExponent.toFixed(2)}
              min={10}
              max={400}
              raw={Math.round(p.overlapExponent * 100)}
              onChange={(n) => set({ overlapExponent: n / 100 })}
              hint="Above the threshold, the constraint rises from none to full across the remaining range, raised to this power. It materially changes filtering behaviour, so it is exposed rather than buried."
            />

            <Slider
              label="Lateral decision interval"
              value={`${p.lateralDecisionInterval.toFixed(2)} s`}
              min={5}
              max={100}
              raw={Math.round(p.lateralDecisionInterval * 100)}
              onChange={(n) => set({ lateralDecisionInterval: n / 100 })}
              hint="How often a driver re-decides where to sit across the road. Braking is reactive and runs every timestep; choosing a lateral position is deliberate and does not."
            />
          </Card>

          <Card
            title={
              <>
                Side friction{' '}
                <Citation marker="MKJI 1997" text={CITATIONS.sideFriction.text} />
              </>
            }
          >
            <Slider
              label="Angkot stops"
              value={`${p.friction.angkotStopRate}/h`}
              min={0}
              max={120}
              raw={p.friction.angkotStopRate}
              onChange={(n) => set({ friction: { ...p.friction, angkotStopRate: n } })}
            />

            <Slider
              label="Pedestrian crossings"
              value={`${p.friction.pedestrianRate}/h`}
              min={0}
              max={200}
              raw={p.friction.pedestrianRate}
              onChange={(n) => set({ friction: { ...p.friction, pedestrianRate: n } })}
            />

            <Slider
              label="Roadside parking"
              value={`${p.friction.parkingWidth.toFixed(1)} m`}
              min={0}
              max={30}
              raw={Math.round(p.friction.parkingWidth * 10)}
              onChange={(n) => set({ friction: { ...p.friction, parkingWidth: n / 10 } })}
            />
          </Card>

          <Card
            title={
              <>
                Vehicle dimensions{' '}
                <Citation marker="MKJI 1997" text={CITATIONS.mkjiDimensions.text} />
              </>
            }
          >
            <div className="params__table-scroll">
              <table className="params__table">
                {/*
                  The only table in the app without one. Its card heading is
                  outside the table, so a screen reader listing tables got an
                  unnamed entry among four named ones.
                */}
                <caption className="visually-hidden">
                  Vehicle dimensions and free-flow speed by type
                </caption>
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
            </div>
            <p className="pfield__hint">
              Free-flow speed for the speed ramp on this scenario is{' '}
              <span className="mono">{(scenario.rampSpeed * 3.6).toFixed(0)} km/h</span>.
              The ramp is normalised to it, so a 30 km/h scene and a 60 km/h scene do
              not look the same.
            </p>
          </Card>

          <Card title="Export">
            <div className="params__buttons">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  download(
                    'detector-records.csv',
                    detectorCsv(logRef.current?.records ?? []),
                  )
                }
              >
                Detector records
              </button>
              <button
                type="button"
                className="btn"
                disabled={dischargeRecords.length === 0}
                onClick={() => download('discharge.csv', dischargeCsv(dischargeRecords))}
              >
                Discharge
              </button>
              <button
                type="button"
                className="btn"
                disabled={sweepPoints.length === 0}
                onClick={() => download('sweep.csv', sweepCsv(sweepPoints))}
              >
                Sweep
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
              >
                Copy link to this run
              </button>
            </div>
            <p className="pfield__hint">
              Files are built in the browser. The app makes no network requests at
              runtime.
            </p>
          </Card>
        </div>
      )}
    </aside>
  );
}
