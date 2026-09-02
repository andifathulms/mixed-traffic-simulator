import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS } from '../scenarios';
import { searchToState, stateToSearch } from '../state/url';
import { effectiveScenario } from '../state/effective-scenario';
import type { AppState } from '../state/app-state';
import { useSimulation } from '../state/useSimulation';
import type { World } from '../sim/types';
import type { WaveTracker } from '../sim/analysis';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import { Road } from '../views/Road/Road';
import { TimeSpace } from '../views/TimeSpace/TimeSpace';
import { TransportBar } from './TransportBar';
import { Header } from './Header';
import { InstrumentBay } from './InstrumentBay';
import { Parameters } from './Parameters';
import { Warnings } from './Warnings';
import { useSweep, measureSecondsFor } from '../batch/useSweep';
import './app.css';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 860,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Reduced motion means the simulation opens paused (DESIGN.md §6.7). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function App() {
  const reduced = useMemo(prefersReducedMotion, []);

  const [state, setState] = useState<AppState>(() => {
    const initial = searchToState(window.location.search);
    // The ring scenario autoplays at 4× so the jam appears within about fifteen
    // seconds of wall clock (DESIGN.md §6.4) — unless motion is reduced, in
    // which case it opens paused at t = 0 with a visible play control.
    if (!reduced && initial.scenario === 'phantom-jam' && !window.location.search) {
      return { ...initial, running: true, speed: 4 };
    }
    return initial;
  });

  const preset = SCENARIOS[state.scenario];
  const scenario = useMemo(
    () => effectiveScenario(preset, state.overrides),
    [preset, state.overrides],
  );
  const narrow = useNarrow();

  // The shared position axis. Both views take the same two numbers, so there is
  // exactly one place the alignment could be got wrong and it is here.
  const viewFrom = 0;
  const viewTo = scenario.geometry.length;

  const roadHeight = narrow ? 120 : 220;
  const recordHeight = narrow ? 200 : 300;
  const secondsPerRow = scenario.geometry.ring ? 0.4 : 1;

  const { handleRef, generation, reset, stepOnce } = useSimulation({
    scenario,
    params: state.params,
    seed: state.seed,
    running: state.running,
    speed: state.speed,
  });

  // Views read the world through refs and draw to canvas; re-rendering React
  // twenty times a second would be pointless and far too slow.
  const worldRef = useRef<World | null>(null);
  const alphaRef = useRef(0);
  const trackerRef = useRef<WaveTracker | null>(null);
  const logRef = useRef<DetectorLog | null>(null);

  useEffect(() => {
    let raf = 0;
    const pump = () => {
      raf = requestAnimationFrame(pump);
      const handle = handleRef.current;
      if (!handle) return;
      worldRef.current = handle.world;
      alphaRef.current = handle.alpha;
      trackerRef.current = handle.tracker;
      logRef.current = handle.log;
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, [handleRef]);

  // Panels that summarise the world are refreshed on a timer rather than per
  // frame. Four times a second is fast enough to feel live and slow enough that
  // React is not re-rendering charts sixty times a second.
  const [tick, setTick] = useState(0);
  const [discharge, setDischarge] = useState<readonly DischargeRecord[]>([]);
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      const handle = handleRef.current;
      if (!handle) return;
      setDischarge([...handle.discharge.records]);
      setWarningCount(handle.world.warnings.length);
    }, 250);
    return () => window.clearInterval(id);
  }, [handleRef]);

  const sweep = useSweep();

  // Every run is linkable (PRD §7.3). replaceState rather than pushState: a
  // slider drag must not fill the back button with a hundred entries.
  useEffect(() => {
    const search = stateToSearch(state);
    window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
  }, [state]);

  const update = useCallback((patch: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const runSweep = useCallback(() => {
    const benchScenario = SCENARIOS.bench;
    const measure = measureSecondsFor(
      state.aggregationInterval,
      benchScenario.detectors.length,
    );
    sweep.run({
      scenario: 'bench',
      params: { ...state.params, inflow: 4000 },
      seed: state.seed,
      variable: 'mcFraction',
      // Zero to ninety per cent, the app's principal independent variable.
      values: Array.from({ length: 19 }, (_, i) => i * 0.05),
      interval: state.aggregationInterval,
      warmup: 90,
      measure,
      // Ground truth costs two further runs per point. It is on, because a
      // bench without the controlled experiment is just four estimates
      // disagreeing with nothing to be wrong about.
      includeTruth: true,
    });
  }, [sweep, state.params, state.seed, state.aggregationInterval]);

  // Keyboard transport controls (PRD §9.8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        setState((s) => ({ ...s, running: !s.running }));
      } else if (e.key === '.') {
        e.preventDefault();
        stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reset, stepOnce]);

  return (
    <div className="app">
      <a className="skip-link" href="#instruments">
        Skip to instruments
      </a>

      <Header scenario={scenario} state={state} onChange={update} />

      {/*
        The road and the time-space diagram are locked to one horizontal
        position axis, pixel for pixel. Both are full-bleed, in the same
        container, with no padding between them and nothing that could offset
        one relative to the other. Nothing may break this (DESIGN.md §4.1).
      */}
      <div className="app__axis">
        <Road
          worldRef={worldRef}
          alphaRef={alphaRef}
          freeSpeed={scenario.rampSpeed}
          selectedVehicle={state.selectedVehicle}
          onSelect={(id) =>
            update({ selectedVehicle: id, tab: id === null ? state.tab : 'inspector' })
          }
          viewFrom={viewFrom}
          viewTo={viewTo}
          generation={generation}
          height={roadHeight}
        />
        <TimeSpace
          worldRef={worldRef}
          trackerRef={trackerRef}
          freeSpeed={scenario.rampSpeed}
          viewFrom={viewFrom}
          viewTo={viewTo}
          generation={generation}
          height={recordHeight}
          secondsPerRow={secondsPerRow}
        />
      </div>

      <Warnings worldRef={worldRef} count={warningCount} />

      <main className="app__main" id="instruments">
        <InstrumentBay
          state={state}
          scenario={scenario}
          worldRef={worldRef}
          logRef={logRef}
          dischargeRecords={discharge}
          generation={generation}
          viewFrom={viewFrom}
          viewTo={viewTo}
          sweepPoints={sweep.points}
          sweepProgress={sweep.progress}
          onRunSweep={runSweep}
          onCancelSweep={sweep.cancel}
          onChange={update}
          aggregationTick={tick}
          narrow={narrow}
        />

        <Parameters
          state={state}
          scenario={scenario}
          onChange={update}
          worldRef={worldRef}
          logRef={logRef}
          dischargeRecords={discharge}
          sweepPoints={sweep.points}
        />
      </main>

      <TransportBar
        state={state}
        scenario={scenario}
        onChange={update}
        onReset={reset}
        onStep={stepOnce}
      />
    </div>
  );
}
