import { describe, it, expect } from 'vitest';
import { step } from '@/sim/world';
import { DT, type LateralRuleId } from '@/sim/types';
import { corridor } from '@/scenarios';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { getLateralRule, LATERAL_RULES } from '@/sim/lateral';
import { nearestLane, laneCentre } from '@/sim/geometry';

function runRule(rule: LateralRuleId, seconds = 300, markings = false) {
  const params = scenarioParams(corridor, {
    lateralRule: rule,
    mcFraction: 0.6,
    inflow: 3000,
  });
  const scenario = markings
    ? { ...corridor, geometry: { ...corridor.geometry, markings: true } }
    : corridor;
  const world = buildWorld(scenario, params, corridor.seed);
  for (let i = 0; i < Math.round(seconds / DT); i++) step(world, DT, params);
  return world;
}

describe('the lateral rule is a choice (PRD §7.1)', () => {
  it('names every rule and states which has no citation', () => {
    expect(getLateralRule('lanes').citation).toBeTruthy();
    expect(getLateralRule('sublane').citation).toBeTruthy();
    // The social force rule has no traffic-literature basis and must say so by
    // carrying null rather than an empty or invented citation.
    expect(getLateralRule('social').citation).toBeNull();
  });

  it('gives every rule a name the interface can show at all times', () => {
    for (const rule of Object.values(LATERAL_RULES)) {
      expect(rule.name.length).toBeGreaterThan(3);
    }
  });
});

describe('the rules produce materially different behaviour', () => {
  const lanes = runRule('lanes');
  const sublane = runRule('sublane');
  const social = runRule('social');

  /** Spread of lateral positions about the nearest lane centre. */
  function laneScatter(world: ReturnType<typeof runRule>): number {
    if (world.vehicles.length === 0) return 0;
    let sum = 0;
    for (const v of world.vehicles) {
      sum += Math.abs(v.y - laneCentre(nearestLane(v.y, world.geometry), world.geometry));
    }
    return sum / world.vehicles.length;
  }

  it('keeps vehicles near lane centres under strict lanes', () => {
    // Under strict lanes the lateral occupancy chart shows discrete spikes;
    // under the others it shows a continuous distribution. That difference is
    // the clearest possible statement of what the rule choice does.
    expect(laneScatter(lanes)).toBeLessThan(laneScatter(sublane));
    expect(laneScatter(lanes)).toBeLessThan(laneScatter(social));
  });

  it('lets motorcycles use lateral positions cars do not, under sublane', () => {
    const mc = sublane.vehicles.filter((v) => v.type === 'MC').map((v) => v.y);
    const lv = sublane.vehicles.filter((v) => v.type === 'LV').map((v) => v.y);
    expect(mc.length).toBeGreaterThan(3);
    expect(lv.length).toBeGreaterThan(3);
    // Motorcycles reach closer to the edges than a car's half-width allows.
    expect(Math.min(...mc)).toBeLessThan(Math.min(...lv));
  });

  it('produces no overlap under any rule', () => {
    for (const world of [lanes, sublane, social]) {
      expect(world.warnings.filter((w) => w.kind === 'overlap')).toHaveLength(0);
      expect(world.warnings.filter((w) => w.kind === 'nan')).toHaveLength(0);
    }
  });

  it('keeps every vehicle on the carriageway under every rule', () => {
    for (const world of [lanes, sublane, social]) {
      for (const v of world.vehicles) {
        expect(v.y - v.width / 2).toBeGreaterThanOrEqual(-0.01);
        expect(v.y + v.width / 2).toBeLessThanOrEqual(world.geometry.width + 0.01);
      }
    }
  });

  it('carries different throughput under different rules', () => {
    // If the rule choice did not change the answer, there would be nothing to
    // show and no reason to make it selectable.
    const values = [lanes.departed, sublane.departed, social.departed];
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('stays deterministic under every rule', () => {
    for (const rule of ['lanes', 'sublane', 'social'] as LateralRuleId[]) {
      const a = runRule(rule, 100);
      const b = runRule(rule, 100);
      expect(a.vehicles.map((v) => `${v.id}:${v.x}:${v.y}`).join('|')).toBe(
        b.vehicles.map((v) => `${v.id}:${v.x}:${v.y}`).join('|'),
      );
    }
  });

  it('does not let motorcycles chatter between equivalent offsets', () => {
    // Without a centring preference vehicles oscillate between two equally good
    // offsets and it looks broken.
    const world = runRule('sublane', 200);
    const mc = world.vehicles.filter((v) => v.type === 'MC');
    expect(mc.length).toBeGreaterThan(0);
    const maxLateral = Math.max(...mc.map((v) => Math.abs(v.vLat)));
    expect(maxLateral).toBeLessThanOrEqual(1.0 + 1e-9);
  });
});
