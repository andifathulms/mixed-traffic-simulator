import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS } from '../scenarios';
import { searchToState, stateToSearch } from '../state/url';
import type { AppState } from '../state/app-state';
import { useSimulation } from '../state/useSimulation';
import type { World } from '../sim/types';
import { Road } from '../views/Road/Road';
import { TransportBar } from './TransportBar';
import { Header } from './Header';
import './app.css';

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

  useEffect(() => {
    let raf = 0;
    const pump = () => {
      raf = requestAnimationFrame(pump);
      const handle = handleRef.current;
      if (!handle) return;
      worldRef.current = handle.world;
      alphaRef.current = handle.alpha;
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

      <main className="app__main">
        <Road
          worldRef={worldRef}
          alphaRef={alphaRef}
          freeSpeed={scenario.rampSpeed}
          selectedVehicle={state.selectedVehicle}
          onSelect={(id) => update({ selectedVehicle: id })}
          viewFrom={0}
          viewTo={scenario.geometry.length}
          generation={generation}
          height={220}
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
