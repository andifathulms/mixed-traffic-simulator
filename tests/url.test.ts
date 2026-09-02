import { describe, it, expect } from 'vitest';
import { stateToSearch, searchToState } from '@/state/url';
import { scenarioParams } from '@/scenarios/build';
import { SCENARIOS } from '@/scenarios';

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
