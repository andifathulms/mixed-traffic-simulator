import { useMemo } from 'react';
import type { AppState, InstrumentTab } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World } from '../sim/types';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import { aggregate, type AggregationInterval } from '../estimators';
import { EquivalenceBench, type BenchPoint } from '../views/EquivalenceBench/EquivalenceBench';
import { SpeedHeatmap } from '../views/SpeedHeatmap/SpeedHeatmap';
import { LateralOccupancy } from '../views/LateralOccupancy/LateralOccupancy';
import { DischargePlot } from '../views/DischargePlot/DischargePlot';
import { Inspector } from '../views/Inspector/Inspector';
import { FundamentalDiagram } from '../views/FundamentalDiagram/FundamentalDiagram';
import { getLateralRule } from '../sim/lateral';
import type { SweepPointResult } from '../batch/protocol';

export interface InstrumentBayProps {
  state: AppState;
  scenario: Scenario;
  worldRef: React.MutableRefObject<World | null>;
  logRef: React.MutableRefObject<DetectorLog | null>;
  dischargeRecords: readonly DischargeRecord[];
  generation: number;
  viewFrom: number;
  viewTo: number;
  sweepPoints: readonly SweepPointResult[];
  sweepProgress: number | null;
  onRunSweep: () => void;
  onCancelSweep: () => void;
  onChange: (patch: Partial<AppState>) => void;
  /** Recomputed on a timer, not every frame — see App. */
  aggregationTick: number;
  narrow: boolean;
}

const TABS: Array<{ id: InstrumentTab; label: string }> = [
  { id: 'bench', label: 'Equivalence bench' },
  { id: 'heatmap', label: 'Speed heatmap' },
  { id: 'lateral', label: 'Lateral occupancy' },
  { id: 'discharge', label: 'Discharge' },
  { id: 'inspector', label: 'Inspector' },
];

export function InstrumentBay({
  state,
  scenario,
  worldRef,
  logRef,
  dischargeRecords,
  generation,
  viewFrom,
  viewTo,
  sweepPoints,
  sweepProgress,
  onRunSweep,
  onCancelSweep,
  onChange,
  aggregationTick,
  narrow,
}: InstrumentBayProps) {
  // The fundamental diagram sits outside the bay on wide screens, permanently
  // visible, because it accumulates continuously and hiding it behind a tab
  // would lose the accumulation (DESIGN.md §4.3). On narrow screens it moves
  // into the bay as another tab.
  const tabs = narrow ? [...TABS, { id: 'fundamental' as const, label: 'Fundamental diagram' }] : TABS;

  // aggregationTick is in the dependency list on purpose: the detector log is
  // a ref that mutates without notifying React, so the timer tick is what
  // makes this recompute. Four times a second, not sixty.
  const intervals = useMemo(() => {
    const log = logRef.current;
    const world = worldRef.current;
    if (!log || !world) return [];
    return aggregate(log.records, state.aggregationInterval, world.t);
  }, [logRef, worldRef, state.aggregationInterval, aggregationTick]);

  const benchPoints: BenchPoint[] = useMemo(
    () =>
      sweepPoints.map((p) => ({
        mcFraction: p.mcFraction,
        truth: p.truth,
        headway: p.headway,
        regression: p.regression,
        speed: p.speed,
        occupancy: p.occupancy,
      })),
    [sweepPoints],
  );

  const fd = (
    <FundamentalDiagram
      intervals={intervals}
      idm={state.params.types.LV.idm}
      vehicleLength={state.params.types.LV.length}
      effectiveLanes={Math.max(1, scenario.geometry.width / state.params.types.LV.width)}
    />
  );

  return (
    <section className="bay on-paper" id="instruments" aria-label="Instruments">
      {!narrow && <div className="bay__fd">{fd}</div>}

      <div className="bay__panel">
        <div className="bay__tabs" role="tablist" aria-label="Instrument">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={state.tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`bay__tab${state.tab === t.id ? ' bay__tab--active' : ''}`}
              onClick={() => onChange({ tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="bay__content"
          role="tabpanel"
          id={`panel-${state.tab}`}
          aria-labelledby={`tab-${state.tab}`}
        >
          {state.tab === 'bench' && (
            <EquivalenceBench
              points={benchPoints}
              interval={state.aggregationInterval}
              onIntervalChange={(interval: AggregationInterval) =>
                onChange({ aggregationInterval: interval })
              }
              progress={sweepProgress}
              onRun={onRunSweep}
              onCancel={onCancelSweep}
            />
          )}

          {state.tab === 'heatmap' && (
            <SpeedHeatmap
              worldRef={worldRef}
              freeSpeed={scenario.rampSpeed}
              viewFrom={viewFrom}
              viewTo={viewTo}
              generation={generation}
            />
          )}

          {state.tab === 'lateral' && (
            <LateralOccupancy
              worldRef={worldRef}
              ruleName={getLateralRule(state.lateralRule).name}
            />
          )}

          {state.tab === 'discharge' && (
            <DischargePlot
              records={dischargeRecords}
              rhkEnabled={scenario.signal?.rhk ?? false}
            />
          )}

          {state.tab === 'inspector' && (
            <Inspector worldRef={worldRef} selectedVehicle={state.selectedVehicle} />
          )}

          {state.tab === 'fundamental' && fd}
        </div>
      </div>
    </section>
  );
}
