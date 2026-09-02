import type { AppState } from '../state/app-state';
import { SPEED_STEPS } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { LateralRuleId } from '../sim/types';
import { getLateralRule } from '../sim/lateral';
import { CITATIONS } from '../sim/defaults';
import { Citation } from './Citation';

export interface TransportBarProps {
  state: AppState;
  scenario: Scenario;
  onChange: (patch: Partial<AppState>) => void;
  onReset: () => void;
  onStep: () => void;
}

const RULE_LABELS: Record<LateralRuleId, string> = {
  lanes: 'Strict lanes',
  sublane: 'Gap-seeking sublane',
  social: 'Social force',
};

/**
 * The transport bar, pinned to the bottom, dark to match the road rather than
 * the instruments — it controls the simulation, not the record (DESIGN.md §4.4).
 *
 * The motorcycle fraction gets the most width, because it is the app's
 * principal independent variable.
 */
export function TransportBar({
  state,
  scenario,
  onChange,
  onReset,
  onStep,
}: TransportBarProps) {
  const rule = getLateralRule(state.lateralRule);
  const isRing = scenario.geometry.ring;

  return (
    <div className="transport">
      <div className="transport__group">
        <button
          type="button"
          className="transport__button"
          onClick={() => onChange({ running: !state.running })}
          aria-pressed={state.running}
        >
          {state.running ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="transport__button" onClick={onStep}>
          Step
        </button>
        <button type="button" className="transport__button" onClick={onReset}>
          Reset
        </button>

        <label className="transport__field">
          <span className="transport__label">Speed</span>
          <select
            value={state.speed}
            onChange={(e) => onChange({ speed: Number(e.target.value) })}
          >
            {SPEED_STEPS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="transport__group transport__group--wide">
        <label className="transport__field transport__field--wide">
          <span className="transport__label">
            Motorcycles{' '}
            <span className="mono transport__value">
              {Math.round(state.params.mcFraction * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={90}
            step={1}
            value={Math.round(state.params.mcFraction * 100)}
            disabled={isRing && scenario.id === 'phantom-jam' ? false : false}
            // Continuous control: takes effect on the frame it changes, with no
            // easing (DESIGN.md §6.1).
            onChange={(e) =>
              onChange({
                params: { ...state.params, mcFraction: Number(e.target.value) / 100 },
              })
            }
          />
        </label>
      </div>

      <div className="transport__group">
        <label className="transport__field">
          <span className="transport__label">Seed</span>
          <input
            className="mono transport__seed"
            type="number"
            min={0}
            value={state.seed}
            onChange={(e) => onChange({ seed: Number(e.target.value) || 0 })}
          />
        </label>

        <label className="transport__field">
          <span className="transport__label">Lateral rule</span>
          <select
            value={state.lateralRule}
            onChange={(e) => {
              const next = e.target.value as LateralRuleId;
              onChange({
                lateralRule: next,
                params: { ...state.params, lateralRule: next },
              });
            }}
          >
            {(Object.keys(RULE_LABELS) as LateralRuleId[]).map((id) => (
              <option key={id} value={id}>
                {RULE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        {/*
          The active lateral rule is named here at all times (PRD §7.1), with
          its citation beside it. A null citation is stated as a caveat rather
          than left as an empty field.
        */}
        <Citation
          dark
          marker={rule.citation ? 'source' : 'no citation'}
          text={rule.citation ?? CITATIONS.socialForce.text}
        />
      </div>
    </div>
  );
}
