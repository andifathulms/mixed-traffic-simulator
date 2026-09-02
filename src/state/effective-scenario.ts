import type { Scenario } from '../scenarios/types';
import type { ScenarioOverrides } from './app-state';

/**
 * Apply the user's overrides to a preset.
 *
 * Presets stay immutable — the override is a separate layer, so resetting to
 * the preset is dropping the layer rather than reconstructing it, and the URL
 * only ever has to carry what the user actually changed.
 */
export function effectiveScenario(base: Scenario, o: ScenarioOverrides): Scenario {
  const width = o.width ?? base.geometry.width;

  const reductions = base.geometry.reductions.map((r) => ({
    ...r,
    severity: o.bottleneckSeverity ?? r.severity,
  }));

  const signal = base.signal
    ? {
        ...base.signal,
        rhk: o.rhk ?? base.signal.rhk,
        green: o.green ?? base.signal.green,
        cycle: o.cycle ?? base.signal.cycle,
      }
    : null;

  // Green cannot exceed the cycle minus the amber and all-red it must contain,
  // or the controller would never show red and the scenario would silently
  // stop being a signalised one.
  if (signal) {
    const maxGreen = Math.max(1, signal.cycle - signal.amber - signal.allRed - 1);
    signal.green = Math.min(signal.green, maxGreen);
  }

  return {
    ...base,
    geometry: {
      ...base.geometry,
      width,
      markings: o.markings ?? base.geometry.markings,
      laneCount: o.laneCount ?? base.geometry.laneCount,
      gradient: o.gradient ?? base.geometry.gradient,
      reductions,
    },
    signal,
  };
}
