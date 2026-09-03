import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World } from '../sim/types';
import { NON_CALIBRATION_NOTICE, SCENARIO_ORDER, SCENARIOS } from '../scenarios';
import { Citation } from './Citation';
import { Telemetry } from './Telemetry';

export interface HeaderProps {
  scenario: Scenario;
  state: AppState;
  onChange: (patch: Partial<AppState>) => void;
  worldRef: React.MutableRefObject<World | null>;
  /** Bumped four times a second, which is what refreshes the telemetry. */
  tick: number;
}

/**
 * The masthead.
 *
 * Three things, in one 56 px band: what this is, which scenario is loaded, and
 * what the simulation is doing right now. The last of those was missing before
 * — the app animated a phenomenon at length without ever stating the clock,
 * the fleet size or the mean speed in words, so a reader could watch a jam
 * form and still not be able to say how fast anything was going.
 *
 * The scenario's own sentence and the non-calibration fact sit below the band
 * on a quieter strip, where they can be read once and then ignored, rather
 * than competing with the controls for the same eye.
 */
export function Header({ scenario, state, onChange, worldRef, tick }: HeaderProps) {
  return (
    <header className="header on-dark">
      <div className="header__bar">
        <div className="header__brand">
          <Mark />
          <div className="header__names">
            <h1 className="header__title">Mixed traffic simulator</h1>
            <p className="header__descriptor">
              Motorcycle-dominated traffic, and why the numbers that describe it
              disagree
            </p>
          </div>
        </div>

        <div className="header__controls">
          <label className="field header__scenario">
            <span className="label" id="scenario-label">
              Scenario
            </span>
            <select
              id="scenario"
              aria-labelledby="scenario-label"
              value={state.scenario}
              onChange={(e) =>
                onChange({
                  scenario: e.target.value as AppState['scenario'],
                  selectedVehicle: null,
                })
              }
            >
              {SCENARIO_ORDER.map((id) => (
                <option key={id} value={id}>
                  {SCENARIOS[id].name}
                </option>
              ))}
            </select>
          </label>
          {scenario.citation && <Citation dark marker="source" text={scenario.citation} />}
        </div>

        <Telemetry worldRef={worldRef} scenario={scenario} state={state} tick={tick} />
      </div>

      <div className="header__strip">
        <p className="header__blurb">{scenario.blurb}</p>
        {/* PRD §7.4, stated once, as a fact. */}
        <p className="header__notice">{NON_CALIBRATION_NOTICE}</p>
      </div>
    </header>
  );
}

/**
 * The mark: four lanes of traffic at four different speeds, which is the whole
 * subject of the app in sixteen pixels. Drawn from the speed ramp, so it is
 * literally the same encoding the road uses.
 */
function Mark() {
  return (
    <svg className="header__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="24" height="24" rx="4" fill="var(--surface-raised)" />
      <rect x="3" y="5" width="13" height="2.5" rx="1.25" fill="var(--speed-100)" />
      <rect x="7" y="10" width="9" height="2.5" rx="1.25" fill="var(--speed-75)" />
      <rect x="3" y="15" width="6" height="2.5" rx="1.25" fill="var(--speed-50)" />
      <rect x="12" y="15" width="3" height="2.5" rx="1.25" fill="var(--speed-25)" />
      <rect x="3" y="20" width="18" height="1" fill="var(--border-dark-strong)" />
    </svg>
  );
}
