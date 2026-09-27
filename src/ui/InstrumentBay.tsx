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
import { BAKED_COMPARISON, BAKED_VARIABLE, bakedPoints, useBakedSweep } from '../batch/baked';

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

  /*
   * The bench opens on the precomputed sweep until the reader runs their own.
   *
   * Only while the reader's sweep settings match what was baked: a chart of
   * motorcycle share under the heading "road width" would be the wrong chart
   * with the right colours. Change the variable or the comparison and the
   * bench shows its empty state and the Run button, as before.
   */
  const baked = useBakedSweep();
  const showBaked =
    sweepPoints.length === 0 &&
    sweepProgress === null &&
    state.sweepVariable === BAKED_VARIABLE &&
    state.sweepComparison === BAKED_COMPARISON;
  const sourcePoints = showBaked ? bakedPoints(baked, state.aggregationInterval) : sweepPoints;
  const provenance =
    showBaked && baked && sourcePoints.length > 0
      ? {
          kind: 'baked' as const,
          seed: baked.seed,
          inflow: baked.params.inflow,
          rule: getLateralRule(baked.params.lateralRule).name,
        }
      : sweepPoints.length > 0
        ? { kind: 'run' as const }
        : null;

  const benchPoints: BenchPoint[] = useMemo(
    () =>
      sourcePoints.map((p) => ({
        value: p.value,
        truthWorking: p.truthWorking,
        seriesKey: p.seriesKey,
        seriesLabel: p.seriesLabel,
        mcFraction: p.mcFraction,
        truth: p.truth,
        headway: p.headway,
        regression: p.regression,
        speed: p.speed,
        occupancy: p.occupancy,
      })),
    [sourcePoints],
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
        {/*
          A tablist owes the reader arrow keys.
          
          The roles were here and the keyboard behaviour they promise was not:
          every tab sat in the tab sequence and the arrow keys did nothing, so
          a screen reader announced "tab 2 of 5" and then the keys it had just
          named were dead. Either the roles go or the behaviour arrives; the
          roles earn their place here, because "2 of 5" is worth knowing in a
          bay of instruments, so the behaviour arrives.

          Roving tabindex: one stop for the whole set, arrows to move within
          it, Home and End to the ends. Selection follows focus, which is the
          right choice when showing a panel is instant and cheap.
        */}
        <div
          className="bay__tabs"
          role="tablist"
          aria-label="Instrument"
          onKeyDown={(e) => {
            const order = tabs.map((t) => t.id);
            const at = order.indexOf(state.tab);
            const to =
              e.key === 'ArrowRight' || e.key === 'ArrowDown'
                ? (at + 1) % order.length
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                  ? (at - 1 + order.length) % order.length
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? order.length - 1
                      : -1;
            if (to === -1) return;
            e.preventDefault();
            onChange({ tab: order[to] });
            document.getElementById(`tab-${order[to]}`)?.focus();
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={state.tab === t.id}
              aria-controls={`panel-${t.id}`}
              /* Only the selected tab is a tab stop; arrows reach the rest. */
              tabIndex={state.tab === t.id ? 0 : -1}
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
              variable={state.sweepVariable}
              onVariableChange={(sweepVariable) => onChange({ sweepVariable })}
              comparison={state.sweepComparison}
              onComparisonChange={(sweepComparison) => onChange({ sweepComparison })}
              progress={sweepProgress}
              onRun={onRunSweep}
              onCancel={onCancelSweep}
              provenance={provenance}
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
