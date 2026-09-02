import { DT, type Params, type World } from './types';
import { step } from './world';

/** Cap on steps per frame, so a backgrounded tab does not lock the thread. */
export const MAX_STEPS_PER_FRAME = 20;

export interface AdvanceResult {
  /** Simulated time left over, carried into the next frame. */
  accumulator: number;
  stepsTaken: number;
  /** True when the cap was hit and simulated time had to be dropped. */
  capped: boolean;
}

/**
 * Advance the world by however many fixed steps the elapsed frame time affords.
 *
 * Extracted from the React hook so the property that matters can actually be
 * tested: the result must not depend on how the elapsed time was divided into
 * frames. A variable timestep tied to frame rate would make every number in
 * the app depend on the user's hardware (CLAUDE.md §1.1, PRD §9.3).
 */
export function advance(
  world: World,
  params: Params,
  /** Wall time since the last frame, s, already multiplied by the speed. */
  elapsed: number,
  accumulator: number,
  onStep?: (world: World) => void,
): AdvanceResult {
  let remaining = accumulator + elapsed;
  let stepsTaken = 0;

  while (remaining >= DT && stepsTaken < MAX_STEPS_PER_FRAME) {
    step(world, DT, params);
    onStep?.(world);
    remaining -= DT;
    stepsTaken++;
  }

  // When capped, drop the excess and say so — never silently run slow.
  const capped = remaining >= DT;
  if (capped) remaining = 0;

  return { accumulator: remaining, stepsTaken, capped };
}
