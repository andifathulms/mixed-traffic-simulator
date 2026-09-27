import type { AppState } from '../state/app-state';
import { SPEED_STEPS } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { LateralRuleId } from '../sim/types';
import { getLateralRule } from '../sim/lateral';
import { CITATIONS } from '../sim/defaults';
import { composition } from '../sim/demand';
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
 * Four groups, in the order they are reached for: run the thing, set its rate,
 * set the one variable the whole app is about, and declare the model. The
 * motorcycle fraction takes every pixel the other three do not, because it is
 * the principal independent variable and a two-centimetre slider for it would
 * have been a lie about what matters here.
 */
export function TransportBar({
  state,
  scenario,
  onChange,
  onReset,
  onStep,
}: TransportBarProps) {
  const rule = getLateralRule(state.lateralRule);
  const mcPercent = Math.round(state.params.mcFraction * 100);

  return (
    <div className="transport on-dark">
      <div className="transport__group transport__group--run">
        {/*
          The one primary action on the bar, and the easiest thing on the
          screen to find: a filled accent disc with a glyph, no reading
          required. The name is on the button for anyone who cannot see it.
        */}
        <button
          type="button"
          className="transport__play"
          onClick={() => onChange({ running: !state.running })}
          aria-pressed={state.running}
          aria-label={state.running ? 'Pause' : 'Play'}
        >
          <PlayPauseGlyph running={state.running} />
        </button>
        <button type="button" className="btn" onClick={onStep}>
          Step
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Reset
        </button>
        {/* PRD §9.8. The shortcuts exist either way; saying so costs one line. */}
        <p className="transport__keys" aria-hidden="true">
          <span className="kbd">space</span>
          <span className="kbd">.</span>
          <span className="kbd">r</span>
        </p>
      </div>

      <div className="transport__group">
        <span className="label" id="speed-label">
          Speed
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="speed-label">
          {SPEED_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state.speed === s}
              className="segmented__item"
              onClick={() => onChange({ speed: s })}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="transport__group transport__group--wide">
        <label className="transport__mc" htmlFor="mc-fraction">
          <span className="label">Motorcycles</span>
          <span className="transport__mc-value readout">{mcPercent}%</span>
        </label>
        <input
          id="mc-fraction"
          type="range"
          min={0}
          max={90}
          step={1}
          value={mcPercent}
          // Continuous control: takes effect on the frame it changes, with no
          // easing (DESIGN.md §6.1).
          onChange={(e) =>
            onChange({
              params: { ...state.params, mcFraction: Number(e.target.value) / 100 },
            })
          }
          // A filled track, so the value is legible without reading the number.
          style={{ '--fill': `${(mcPercent / 90) * 100}%` } as React.CSSProperties}
          className="transport__slider"
        />
        <MixBar params={state.params} />
      </div>

      <div className="transport__group transport__group--model">
        <label className="field">
          <span className="label">Seed</span>
          <input
            className="transport__seed"
            type="number"
            min={0}
            value={state.seed}
            onChange={(e) => onChange({ seed: Number(e.target.value) || 0 })}
          />
        </label>

        <label className="field">
          <span className="label">Lateral rule</span>
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

        <span className="visually-hidden">
          {scenario.geometry.ring ? 'Ring scenario' : 'Open corridor'}
        </span>
      </div>
    </div>
  );
}

function PlayPauseGlyph({ running }: { running: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {running ? (
        <>
          <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
        </>
      ) : (
        <path d="M4.5 2.5 L13.5 8 L4.5 13.5 Z" fill="currentColor" />
      )}
    </svg>
  );
}

const MIX: Array<{ type: 'MC' | 'LV' | 'HV' | 'PU'; label: string }> = [
  { type: 'MC', label: 'Motorcycles' },
  { type: 'LV', label: 'Light vehicles' },
  { type: 'HV', label: 'Heavy vehicles' },
  { type: 'PU', label: 'Angkot' },
];

/**
 * The fleet the slider produces, as one stacked bar. The slider sets one share
 * and the other three follow from it; the bar shows what that means for the
 * whole stream, in the four type values the lateral cross-section uses — not
 * in hue, which is reserved for the estimators.
 */
function MixBar({ params }: { params: TransportBarProps['state']['params'] }) {
  const shares = composition(params);
  const title = MIX.map((m) => `${m.label} ${Math.round(shares[m.type] * 100)}%`).join(', ');
  return (
    <span className="transport__mix" title={title} aria-label={`Fleet: ${title}`} role="img">
      {MIX.map((m) => (
        <i
          key={m.type}
          className={`transport__mix-${m.type.toLowerCase()}`}
          style={{ width: `${shares[m.type] * 100}%` }}
        />
      ))}
    </span>
  );
}
