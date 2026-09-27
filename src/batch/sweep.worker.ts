/// <reference lib="webworker" />
import type { SweepMessage, SweepResponse } from './protocol';
import { runSweep } from './sweep-core';

/**
 * Batch sweeps, headless and off the main thread.
 *
 * The interactive simulation stays on the main thread — at 400 vehicles it is
 * well inside budget and a worker would add latency to every control. Only the
 * sweep comes here, because it runs thousands of simulated seconds and would
 * otherwise freeze the interface (CLAUDE.md §Stack).
 *
 * Because the engine is deterministic and seeded, a sweep is reproducible from
 * its seed and parameter set alone, so both are returned with the result. The
 * sweep itself is in sweep-core.ts; this file is the channel.
 */

let cancelled = false;

/**
 * Hand the worker's event loop back for one turn.
 *
 * The sweep used to run to completion inside its own onmessage handler, which
 * meant the worker never returned to its message queue and the cancel message
 * sat there undelivered. `cancelled` could not become true while a sweep was
 * running, so Cancel did nothing for the entire two or three minutes of a run
 * and the only way out was to reload the page.
 *
 * A macrotask, not a microtask: awaiting a resolved promise drains the
 * microtask queue without ever letting a queued message in. setTimeout is what
 * actually yields.
 */
function yieldToMessages(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function post(message: SweepResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

self.onmessage = (event: MessageEvent<SweepMessage>) => {
  const message = event.data;
  if (message.kind === 'cancel') {
    cancelled = true;
    return;
  }
  cancelled = false;
  // Not awaited: returning immediately is what lets a later cancel message be
  // delivered at all. Failures come back through the same error channel.
  void runSweep(message, {
    post,
    yieldToMessages,
    isCancelled: () => cancelled,
  }).catch((error: unknown) => {
    post({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  });
};
