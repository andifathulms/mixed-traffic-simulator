import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import { NON_CALIBRATION_NOTICE, SCENARIO_ORDER, SCENARIOS } from '../scenarios';
import { Citation } from './Citation';

export interface HeaderProps {
  scenario: Scenario;
  state: AppState;
  onChange: (patch: Partial<AppState>) => void;
}

export function Header({ scenario, state, onChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__title">
        <h1>Mixed traffic simulator</h1>
        <p className="header__descriptor">
          Motorcycle-dominated traffic, and why the numbers that describe it disagree
        </p>
      </div>

      <div className="header__scenario">
        <label className="header__label" htmlFor="scenario">
          Scenario
        </label>
        <select
          id="scenario"
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
        {scenario.citation && <Citation marker="source" text={scenario.citation} />}
        <p className="header__blurb">{scenario.blurb}</p>
        {/* PRD §7.4, stated once, as a fact. */}
        <p className="header__notice">{NON_CALIBRATION_NOTICE}</p>
      </div>
    </header>
  );
}
