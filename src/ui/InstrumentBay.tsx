import { useMemo } from 'react';
import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World } from '../sim/types';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import { aggregate, type AggregationInterval } from '../estimators';
import { EquivalenceBench, type BenchPoint } from '../views/EquivalenceBench/EquivalenceBench';
import { SpeedHeatmap } from '../views/SpeedHeatmap/SpeedHeatmap';
import { LateralOccupancy } from '../views/LateralOccupancy/LateralOccupancy';
import { DischargePlot } from '../views/DischargePlot/DischargePlot';
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
  /** Below 860 px. The bench chart is drawn at a size a phone can read. */
  narrow: boolean;
}

/**
 * The instruments, laid out for the view that is open.
 *
 * They used to share one tab strip, so only one could be seen at a time and
 * the bench — the argument — was a tab among five, two screens below the
 * road. Measure now shows the four detector instruments together, because
 * they are four readings of one stream and are read against each other;
 * Compare gives the bench the whole width. The fundamental diagram is always
 * visible in Measure, which is what §4.3 asked of it: it accumulates, and
 * hiding it behind a tab lost the accumulation.
 */
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

  if (state.view === 'compare') {
    return (
      <section
        className="bay bay--compare on-paper"
        id="instruments"
        role="tabpanel"
        aria-labelledby="view-compare"
      >
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
          // The whole view is the bench's, so the chart takes the width — but
          // on a phone a 1100-unit chart scales its ticks down to six pixels.
          width={narrow ? 520 : 1100}
          height={narrow ? 400 : 440}
        />
      </section>
    );
  }

  return (
    <section
      className="bay bay--measure on-paper"
      id="instruments"
      role="tabpanel"
      aria-labelledby="view-measure"
    >
      <div className="bay__cell">{fd}</div>
      <div className="bay__cell">
        <SpeedHeatmap
          worldRef={worldRef}
          freeSpeed={scenario.rampSpeed}
          viewFrom={viewFrom}
          viewTo={viewTo}
          generation={generation}
        />
      </div>
      <div className="bay__cell">
        <LateralOccupancy worldRef={worldRef} ruleName={getLateralRule(state.lateralRule).name} />
      </div>
      <div className="bay__cell">
        <DischargePlot records={dischargeRecords} rhkEnabled={scenario.signal?.rhk ?? false} />
      </div>
    </section>
  );
}
