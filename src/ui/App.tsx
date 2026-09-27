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
import { LivePanel } from './LivePanel';
import { Ruler } from './Ruler';
import { InstrumentBay } from './InstrumentBay';
import { Inspector } from '../views/Inspector/Inspector';
import { Parameters } from './Parameters';
import { Warnings } from './Warnings';
import { MakerSignature } from './MakerSignature';
import { useSweep, benchRequest } from '../batch/useSweep';
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
  /*
   * Outside Watch the stage docks to a strip: the road stays in view so the
   * reader never loses the simulation behind the chart they are reading.
   *
   * It docks by clipping, not by unmounting. The record is a chart recorder
   * whose history is never redrawn (DESIGN.md §5.2); unmounting it, or
   * resizing its canvas, would throw that history away every time the reader
   * glanced at another view. So the record keeps its size and keeps drawing
   * below the clip, and only the road's own height changes.
   */
  const docked = state.view !== 'watch';
  const roadHeight = docked
    ? scenario.geometry.ring
      ? 160
      : 96
    : narrow
      ? scenario.geometry.ring
        ? 240
        : 120
      : scenario.geometry.ring
        ? 340
        : 220;
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

  /*
   * Whether the tune drawer is open. Not in the URL: like `running`, it is
   * where the reader is looking, not what is being simulated (CLAUDE.md §10).
   */
  const [tuneOpen, setTuneOpen] = useState(
    // A link ending #tune opens on the drawer, for pointing someone at a setting.
    () => typeof window !== 'undefined' && window.location.hash === '#tune',
  );

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
    sweep.run(
      benchRequest({
        params: state.params,
        seed: state.seed,
        interval: state.aggregationInterval,
        variable: state.sweepVariable,
        comparison: state.sweepComparison,
      }),
    );
  }, [
    sweep,
    state.params,
    state.seed,
    state.aggregationInterval,
    state.sweepVariable,
    state.sweepComparison,
  ]);

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
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        // The keys printed on the view switch (DESIGN.md §4.3).
        const view = (['watch', 'measure', 'compare'] as const)[Number(e.key) - 1];
        setState((s) => ({ ...s, view }));
      } else if (e.key === 't' || e.key === 'T') {
        setTuneOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setTuneOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reset, stepOnce]);

  return (
    <div className={`app app--${state.view}`}>
      <a className="skip-link" href={state.view === 'watch' ? '#stage' : '#instruments'}>
        {state.view === 'watch' ? 'Skip to the road' : 'Skip to instruments'}
      </a>

      <Header
        state={state}
        onChange={update}
        tuneOpen={tuneOpen}
        onTune={() => setTuneOpen((o) => !o)}
      />

      {/*
        The stage: the axis column and the live readings beside it. The panel
        sits beside the whole column rather than beside the road alone, so the
        road, the ruler and the record all narrow together and the shared
        axis survives it.
      */}
      <div
        className={`stage${docked ? ' stage--docked' : ''}`}
        id="stage"
        role={state.view === 'watch' ? 'tabpanel' : undefined}
        aria-labelledby={state.view === 'watch' ? 'view-watch' : undefined}
        // Tag, road and ruler; the record carries on below the clip.
        style={docked ? { maxHeight: roadHeight + 58 } : undefined}
      >
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
              <span className="stage__ramp" aria-hidden="true" />
            </span>
          </div>
          <Road
            worldRef={worldRef}
            alphaRef={alphaRef}
            freeSpeed={scenario.rampSpeed}
            selectedVehicle={state.selectedVehicle}
            onSelect={(id) => update({ selectedVehicle: id })}
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

          {/*
            The inspector, beside the road rather than in a tab two panels
            away. Selecting a vehicle used to switch the instrument strip far
            below the click; now the arithmetic appears over the road, next to
            the ring that marks the vehicle it describes.
          */}
          {state.selectedVehicle !== null && (
            <div className="inspector-card">
              <Inspector
                worldRef={worldRef}
                selectedVehicle={state.selectedVehicle}
                onClose={() => update({ selectedVehicle: null })}
              />
            </div>
          )}
        </div>
        <LivePanel
          worldRef={worldRef}
          scenario={scenario}
          state={state}
          tick={tick}
          generation={generation}
        />
        {docked && (
          <button
            type="button"
            className="stage__undock"
            onClick={() => update({ view: 'watch' })}
          >
            Back to the full road and record
          </button>
        )}
      </div>

      <Warnings worldRef={worldRef} count={warningCount} />

      <main className="app__main">
        {state.view !== 'watch' && (
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
          />
        )}

        <Parameters
          state={state}
          scenario={scenario}
          onChange={update}
          worldRef={worldRef}
          logRef={logRef}
          dischargeRecords={discharge}
          sweepPoints={sweep.points}
          open={tuneOpen}
          onOpenChange={setTuneOpen}
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
