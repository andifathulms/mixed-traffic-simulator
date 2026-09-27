import { useCallback, useEffect, useRef, useState } from 'react';
import type { Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type { SweepPointResult, SweepRequest, SweepResponse } from './protocol';

// The sizing functions are pure and live beside the request builder, so the
// bake script can use them without pulling React in. Re-exported here because
// this is where the rest of the app has always found them.
export {
  measureSecondsFor,
  armCount,
  sweepValues,
  runCount,
  DEFAULT_REPLICATES,
  benchRequest,
} from './request';

export interface SweepState {
  points: SweepPointResult[];
  progress: number | null;
  elapsedMs: number | null;
  error: string | null;
  /** Seed and params of the completed sweep, so the chart can be regenerated. */
  provenance: { seed: number; params: Params; scenario: ScenarioId } | null;
}

export function useSweep() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SweepState>({
    points: [],
    progress: null,
    elapsedMs: null,
    error: null,
    provenance: null,
  });

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((request: Omit<SweepRequest, 'kind'>) => {
    workerRef.current?.terminate();

    const worker = new Worker(new URL('./sweep.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    setState({ points: [], progress: 0, elapsedMs: null, error: null, provenance: null });

    worker.onmessage = (event: MessageEvent<SweepResponse>) => {
      const message = event.data;
      switch (message.kind) {
        case 'point':
          setState((s) => ({ ...s, points: [...s.points, message.point] }));
          break;
        case 'progress':
          setState((s) => ({ ...s, progress: message.done / message.total }));
          break;
        case 'done':
          setState((s) => ({
            ...s,
            progress: null,
            elapsedMs: message.elapsedMs,
            provenance: {
              seed: message.seed,
              params: message.params,
              scenario: message.scenario,
            },
          }));
          worker.terminate();
          workerRef.current = null;
          break;
        case 'cancelled':
          setState((s) => ({ ...s, progress: null }));
          worker.terminate();
          workerRef.current = null;
          break;
        case 'error':
          setState((s) => ({ ...s, progress: null, error: message.message }));
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.postMessage({ kind: 'run', ...request } satisfies SweepRequest);
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ kind: 'cancel' });
  }, []);

  return { ...state, run, cancel };
}
