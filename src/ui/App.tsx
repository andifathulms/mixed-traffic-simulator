import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS } from '../scenarios';
import { searchToState, stateToSearch } from '../state/url';
import { effectiveScenario } from '../state/effective-scenario';
import type { AppState } from '../state/app-state';
import { NO_OVERRIDES } from '../state/app-state';
import { scenarioParams } from '../scenarios/build';
import { useSimulation } from '../state/useSimulation';
import type { World } from '../sim/types';
import type { WaveTracker } from '../sim/analysis';
import type { DetectorLog } from '../sim/detectors';
import type { DischargeRecord } from '../sim/discharge';
import { Road } from '../views/Road/Road';
import { TimeSpace } from '../views/TimeSpace/TimeSpace';
import { TransportBar } from './TransportBar';
import { Header } from './Header';
import { Ruler } from './Ruler';
import { InstrumentBay } from './InstrumentBay';
import { Parameters } from './Parameters';
import { Warnings } from './Warnings';
import { MakerSignature } from './MakerSignature';
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

  // The ring is drawn as a ring, and a ring in a 220 px band is a 79 px circle
  // with twenty-two vehicles on it — too small to read the composition that is
  // the whole point. It gets a taller stage (DESIGN.md §4.2).
  const roadHeight = narrow ? (scenario.geometry.ring ? 220 : 120) : scenario.geometry.ring ? 380 : 220;
  const recordHeight = narrow ? 200 : 280;
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
    setState((prev) => {
      /*
       * Choosing a scenario loads that scenario, parameters and all.
       *
       * It used to change only the name. Everything else — inflow, motorcycle
       * fraction, side friction, geometry overrides — stayed at the outgoing
       * scenario's values, so arriving on the phantom jam (a closed ring, no
       * inflow, no motorcycles) and picking "Corridor" gave an open road with
       * an inflow of zero: a correct simulation of nothing at all, forever.
       * Four of the six scenarios were unreachable from the picker.
       *
       * It also disagreed with the link: opening ?s=corridor loaded the
       * corridor's own parameters, so the same scenario meant two different
       * things depending on how you got there. Now both paths are the same
       * path.
       *
       * The lateral rule survives, because it is a modelling choice rather than
       * a property of the road — it is named in the transport bar at all times
       * for exactly that reason (PRD §7.1).
       */
      if (patch.scenario && patch.scenario !== prev.scenario) {
        return {
          ...prev,
          ...patch,
          params: scenarioParams(SCENARIOS[patch.scenario], {
            lateralRule: prev.lateralRule,
          }),
          overrides: NO_OVERRIDES,
          selectedVehicle: null,
        };
      }
      return { ...prev, ...patch };
    });
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

      <Header
        scenario={scenario}
        state={state}
        onChange={update}
        worldRef={worldRef}
        tick={tick}
      />

      {/*
        The road and the time-space diagram are locked to one horizontal
        position axis, pixel for pixel. Both are full-bleed, in the same
        container, with no padding between them and nothing that could offset
        one relative to the other. Nothing may break this (DESIGN.md §4.1).
      */}
      <div className="app__axis">
        <div className="stage__tag">
          <span className="label">Road</span>
          {/*
            Written for a first read rather than for someone who already knows
            the encoding. "Speed is luminance" is exact and means nothing until
            you have been told what luminance is doing here.
          */}
          <span className="stage__tag-note">
            {scenario.geometry.ring
              ? `a ${Math.round(scenario.geometry.length)} m loop, drawn as a ring`
              : 'the road, seen from above'}
            <span className="sep" aria-hidden="true">
              ·
            </span>
            each mark is a vehicle, brighter means faster
          </span>
        </div>
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
          roadWidth={scenario.geometry.width}
          ring={scenario.geometry.ring}
        />
        <Ruler from={viewFrom} to={viewTo} ring={scenario.geometry.ring} />
        <div className="stage__tag">
          <span className="label">Record</span>
          <span className="stage__tag-note">
            every vehicle&apos;s path, on the same left-to-right positions
            <span className="sep" aria-hidden="true">
              ·
            </span>
            a backward-leaning stripe is a jam
          </span>
        </div>
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

      {/*
        The instruments anchor lives on the instrument bay itself, not here.
        On <main> it covered the road and the record too, so "Skip to
        instruments" landed at the top of the page and skipped nothing.
      */}
      <main className="app__main">
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

        {/*
          Inside main, not after the transport bar. The bar is sticky and the
          last child of .app, which is what keeps it pinned to the bottom of
          the viewport; putting anything after it would let the app's primary
          controls scroll away at the end of the page.
        */}
        <MakerSignature />
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
