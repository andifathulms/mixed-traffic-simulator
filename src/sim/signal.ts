import type { SignalState, Vehicle, World } from './types';
import { forwardDistance } from './geometry';

export function createSignal(init: Partial<SignalState> & { position: number }): SignalState {
  const green = init.green ?? 30;
  const amber = init.amber ?? 3;
  const allRed = init.allRed ?? 2;
  return {
    position: init.position,
    cycle: init.cycle ?? 80,
    green,
    amber,
    allRed,
    aspect: 'red',
    phaseTime: 0,
    rhk: init.rhk ?? false,
    rhkDepth: init.rhkDepth ?? 5,
    cycleIndex: 0,
  };
}

/** Fixed-time controller. Green, then amber, then all-red, then red for the remainder. */
export function advanceSignal(world: World, dt: number): void {
  const s = world.signal;
  if (!s) return;

  s.phaseTime += dt;
  if (s.phaseTime >= s.cycle) {
    s.phaseTime -= s.cycle;
    s.cycleIndex++;
  }

  if (s.phaseTime < s.green) s.aspect = 'green';
  else if (s.phaseTime < s.green + s.amber) s.aspect = 'amber';
  else s.aspect = 'red';
}

/**
 * Distance from a vehicle to its effective stop line, or Infinity when the
 * signal does not constrain it.
 *
 * With RHK enabled, motorcycles have a stop line ahead of everyone else — that
 * is what the painted box is. Without it they percolate to the front anyway and
 * stop wherever they arrive, which the lateral rule already produces (PRD §4.4).
 */
export function signalConstraint(v: Vehicle, world: World): number {
  const s = world.signal;
  if (!s) return Infinity;
  if (s.aspect === 'green') return Infinity;

  const stopLine =
    s.rhk && v.type === 'MC' ? s.position - s.rhkDepth : s.position;

  const distance = forwardDistance(v.x, stopLine, world.geometry) - v.length / 2;

  // Behind the line but too far to matter, or already past it — let it go.
  if (distance > 200 || distance < 0) return Infinity;

  // On amber, a vehicle too close to stop comfortably continues, which is what
  // produces the dilemma-zone behaviour rather than an unphysical stop.
  if (s.aspect === 'amber') {
    const stoppingDistance = (v.v * v.v) / (2 * v.params.b);
    if (distance < stoppingDistance) return Infinity;
  }

  return distance;
}

/** True when a vehicle sits inside the painted RHK box, for rendering and discharge. */
export function inRhkBox(v: Vehicle, s: SignalState, world: World): boolean {
  if (!s.rhk) return false;
  const ahead = forwardDistance(v.x, s.position, world.geometry);
  return ahead >= 0 && ahead <= s.rhkDepth;
}
