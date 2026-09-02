import { describe, it, expect } from 'vitest';
import { stateToSearch, searchToState } from '@/state/url';
import { scenarioParams } from '@/scenarios/build';
import { SCENARIOS } from '@/scenarios';
import { effectiveScenario } from '@/state/effective-scenario';

describe('URL serialisation (PRD §7.3)', () => {
  it('round-trips a modified state exactly', () => {
    const state = searchToState('');
    state.scenario = 'corridor';
    state.params = scenarioParams(SCENARIOS.corridor);
    state.params.mcFraction = 0.735;
    state.params.inflow = 3120;
    state.lateralRule = 'social';
    state.params.lateralRule = 'social';
    state.seed = 987654;
    state.speed = 4;
    state.aggregationInterval = 3600;

    const back = searchToState(stateToSearch(state));
    expect(back.scenario).toBe('corridor');
    expect(back.params.mcFraction).toBeCloseTo(0.735, 6);
    expect(back.params.inflow).toBe(3120);
    expect(back.lateralRule).toBe('social');
    expect(back.seed).toBe(987654);
    expect(back.speed).toBe(4);
    expect(back.aggregationInterval).toBe(3600);
  });

  it('omits values that match the scenario defaults', () => {
    const state = searchToState('');
    const search = stateToSearch(state);
    // Only the scenario itself needs naming when nothing has been changed.
    expect(search).toBe('s=phantom-jam');
  });

  it('does not serialise where the user is looking', () => {
    const state = searchToState('');
    state.running = true;
    state.selectedVehicle = 42;
    const search = stateToSearch(state);
    expect(search).not.toContain('running');
    expect(search).not.toContain('42');
    expect(searchToState(search).running).toBe(false);
    expect(searchToState(search).selectedVehicle).toBeNull();
  });

  it('opens a hand-edited or malformed link on the defaults rather than failing', () => {
    const state = searchToState('s=nonsense&mc=banana&seed=-5&x=9999&agg=7');
    expect(state.scenario).toBe('phantom-jam');
    expect(Number.isFinite(state.params.mcFraction)).toBe(true);
    expect(state.seed).toBeGreaterThanOrEqual(0);
    expect(state.speed).toBeLessThanOrEqual(16);
    expect(state.aggregationInterval).toBe(300);
  });

  it('clamps values into their legal range', () => {
    const state = searchToState('s=corridor&mc=5&q=999999');
    expect(state.params.mcFraction).toBeLessThanOrEqual(0.95);
    expect(state.params.inflow).toBeLessThanOrEqual(20000);
  });

  it('reproduces the same simulation from a shared link', () => {
    const a = searchToState('s=corridor&seed=4471&mc=0.42&rule=social');
    const b = searchToState(stateToSearch(a));
    expect(b.seed).toBe(a.seed);
    expect(b.params.mcFraction).toBe(a.params.mcFraction);
    expect(b.params.lateralRule).toBe(a.params.lateralRule);
  });
});

describe('scenario overrides', () => {
  it('round-trips geometry and signal overrides', () => {
    const state = searchToState('s=signal');
    state.overrides = {
      ...state.overrides,
      width: 9.5,
      markings: true,
      laneCount: 3,
      gradient: 0.04,
      rhk: true,
      green: 42,
      cycle: 95,
    };
    const back = searchToState(stateToSearch(state));
    expect(back.overrides.width).toBeCloseTo(9.5, 6);
    expect(back.overrides.markings).toBe(true);
    expect(back.overrides.laneCount).toBe(3);
    expect(back.overrides.gradient).toBeCloseTo(0.04, 6);
    expect(back.overrides.rhk).toBe(true);
    expect(back.overrides.green).toBe(42);
    expect(back.overrides.cycle).toBe(95);
  });

  it('writes nothing for overrides the user did not set', () => {
    const state = searchToState('s=corridor');
    expect(stateToSearch(state)).toBe('s=corridor');
  });

  it('distinguishes an override of false from an unset one', () => {
    // markings: false must survive, or switching them off would silently
    // revert to the preset on reload.
    const state = searchToState('s=corridor');
    state.overrides = { ...state.overrides, markings: false, rhk: false };
    const back = searchToState(stateToSearch(state));
    expect(back.overrides.markings).toBe(false);
    expect(back.overrides.rhk).toBe(false);
  });
});

describe('effective scenario', () => {
  it('applies overrides without mutating the preset', () => {
    const base = SCENARIOS.signal;
    const originalWidth = base.geometry.width;
    const originalRhk = base.signal!.rhk;
    const applied = effectiveScenario(base, {
      ...searchToState('').overrides,
      width: 12,
      rhk: true,
    });
    expect(applied.geometry.width).toBe(12);
    expect(applied.signal!.rhk).toBe(true);
    // The preset itself is untouched, so resetting is dropping a layer.
    expect(base.geometry.width).toBe(originalWidth);
    expect(base.signal!.rhk).toBe(originalRhk);
  });

  it('caps green below the cycle so the controller always shows red', () => {
    const applied = effectiveScenario(SCENARIOS.signal, {
      ...searchToState('').overrides,
      cycle: 40,
      green: 200,
    });
    const s = applied.signal!;
    expect(s.green).toBeLessThan(s.cycle - s.amber - s.allRed);
  });
});
