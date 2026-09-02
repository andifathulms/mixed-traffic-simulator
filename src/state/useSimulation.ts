import { useCallback, useEffect, useRef, useState } from 'react';
import { DT, type Params, type World } from '../sim/types';
import { step } from '../sim/world';
import { buildWorld } from '../scenarios/build';
import { SCENARIOS } from '../scenarios';
import type { ScenarioId } from '../scenarios/types';
import {
  attachDetectorLog,
  createDetectorLog,
  type DetectorLog,
} from '../sim/detectors';
import { WaveTracker } from '../sim/analysis';

/** Cap on steps per frame, so a backgrounded tab does not lock the thread. */
const MAX_STEPS_PER_FRAME = 20;

export interface SimulationHandle {
  world: World;
  log: DetectorLog;
  tracker: WaveTracker;
  /** Sub-timestep interpolation factor for smooth drawing, 0..1. */
  alpha: number;
  /** Frames on which the step cap was hit and simulated time was dropped. */
  droppedFrames: number;
  /** Bumped whenever the world is rebuilt, so views can clear their history. */
  generation: number;
}

export interface UseSimulationOptions {
  scenario: ScenarioId;
  params: Params;
  seed: number;
  running: boolean;
  speed: number;
  /** Called once per animation frame after stepping. */
  onFrame?: (handle: SimulationHandle) => void;
}

/**
 * The simulation loop.
 *
 * Physics runs at a fixed 0.05 s timestep, decoupled from render (CLAUDE.md
 * §1.1). A variable timestep tied to frame rate would make every number in the
 * app depend on the user's hardware.
 *
 * The world lives in a ref rather than in state: it mutates twenty times a
 * second and re-rendering React on every step would be both pointless and far
 * too slow. Views read it directly and draw to canvas.
 */
export function useSimulation(options: UseSimulationOptions) {
  const { scenario, params, seed, running, speed, onFrame } = options;

  const handleRef = useRef<SimulationHandle | null>(null);
  const [generation, setGeneration] = useState(0);

  // Params change on the frame they are edited (DESIGN.md §6.1), so the loop
  // reads them from a ref rather than closing over a stale value.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const build = useCallback(() => {
    const def = SCENARIOS[scenario];
    const world = buildWorld(def, paramsRef.current, seed);
    handleRef.current = {
      world,
      log: createDetectorLog(),
      tracker: new WaveTracker(),
      alpha: 0,
      droppedFrames: 0,
      generation: 0,
    };
    setGeneration((g) => {
      handleRef.current!.generation = g + 1;
      return g + 1;
    });
  }, [scenario, seed]);

  // Rebuild whenever the scenario or seed changes. Parameter edits do not
  // rebuild — they take effect on the running simulation, which is the point.
  useEffect(() => {
    build();
  }, [build]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let accumulator = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const handle = handleRef.current;
      if (!handle) return;

      const delta = last === 0 ? 0 : Math.min(0.25, (now - last) / 1000);
      last = now;

      if (runningRef.current) {
        accumulator += delta * speedRef.current;

        let steps = 0;
        attachDetectorLog(handle.log);
        try {
          while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
            step(handle.world, DT, paramsRef.current);
            handle.tracker.observe(handle.world);
            accumulator -= DT;
            steps++;
          }
        } finally {
          attachDetectorLog(null);
        }

        if (accumulator >= DT) {
          // The cap was hit. Drop the excess rather than silently running slow,
          // and record it so the interface can say the multiplier is not being
          // met rather than quietly lying about the speed.
          accumulator = 0;
          handle.droppedFrames++;
        }
      }

      handle.alpha = accumulator / DT;
      onFrameRef.current?.(handle);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = useCallback(() => build(), [build]);

  const stepOnce = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    attachDetectorLog(handle.log);
    try {
      step(handle.world, DT, paramsRef.current);
      handle.tracker.observe(handle.world);
    } finally {
      attachDetectorLog(null);
    }
    onFrameRef.current?.(handle);
  }, []);

  return { handleRef, generation, reset, stepOnce };
}
