import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS } from '../scenarios';
import { searchToState, stateToSearch } from '../state/url';
import type { AppState } from '../state/app-state';
import { useSimulation } from '../state/useSimulation';
import type { World } from '../sim/types';
import type { WaveTracker } from '../sim/analysis';
import { Road } from '../views/Road/Road';
import { TimeSpace } from '../views/TimeSpace/TimeSpace';
import { TransportBar } from './TransportBar';
import { Header } from './Header';
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
    // The ring scenario autoplays at 4x so the jam appears within about fifteen
    // seconds of wall clock (DESIGN.md §6.4) — unless motion is reduced, in
    // which case it opens paused at t = 0 with a visible play control.
    if (!reduced && initial.scenario === 'phantom-jam' && !window.location.search) {
      return { ...initial, running: true, speed: 4 };
    }
    return initial;
  });

  const scenario = SCENARIOS[state.scenario];

  // The shared position axis. Both views take the same two numbers, so there is
  // exactly one place the alignment could be got wrong and it is here.
  const viewFrom = 0;
  const viewTo = scenario.geometry.length;

  // §4.6 Below 860 px both shrink but stay stacked and keep their shared axis.
  // They are the app and they do not collapse.
  const narrow = useNarrow();
  const roadHeight = narrow ? 120 : 220;
  const recordHeight = narrow ? 200 : 300;
  // A longer corridor needs a coarser record or the jam stripes compress into
  // an unreadable band before the paper has scrolled once.
  const secondsPerRow = scenario.geometry.ring ? 0.4 : 1;

  const { handleRef, generation, reset, stepOnce } = useSimulation({
    scenario: state.scenario,
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

  useEffect(() => {
    let raf = 0;
    const pump = () => {
      raf = requestAnimationFrame(pump);
      const handle = handleRef.current;
      if (!handle) return;
      worldRef.current = handle.world;
      alphaRef.current = handle.alpha;
      trackerRef.current = handle.tracker;
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, [handleRef]);

  // Every run is linkable (PRD §7.3). replaceState rather than pushState: a
  // slider drag must not fill the back button with a hundred entries.
  useEffect(() => {
    const search = stateToSearch(state);
    window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
  }, [state]);

  const update = useCallback((patch: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#instruments">
        Skip to instruments
      </a>

      <Header scenario={scenario} state={state} onChange={update} />

      {/*
        The road and the time-space diagram are locked to one horizontal
        position axis, pixel for pixel. Both are full-bleed, in the same
        container, with no padding between them and no element that could
        offset one relative to the other. Nothing may break this alignment —
        not a legend, not a margin, not a responsive breakpoint (DESIGN.md §4.1).
      */}
      <main className="app__main" id="instruments">
        <div className="app__axis">
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
