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
 * What this is gets its own line below the band rather than a caption slot
 * inside the brand block. Squeezed beside the title it had to be 11 px and
 * clamped to 44 characters, which made the one sentence that explains the app
 * the least readable text on the page. It now has the full width, and the
 * scenario's own sentence and the non-calibration fact sit under it in the
 * smaller size, so the strip reads top down: what this is, what you are
 * looking at, and what it does not claim.
 */
export function Header({ scenario, state, onChange, worldRef, tick }: HeaderProps) {
  return (
    <header className="header on-dark">
      <div className="header__bar">
        <div className="header__brand">
          <Mark />
          <h1 className="header__title">Mixed traffic simulator</h1>
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
        <p className="header__descriptor">
          Motorcycle-dominated traffic, and why the numbers that describe it
          disagree.{' '}
          <a className="header__jump" href="#instruments">
            Compare the five methods ↓
          </a>
        </p>
        <div className="header__context">
          <p className="header__blurb">{scenario.blurb}</p>
          {/* PRD §7.4, stated once, as a fact. */}
          <p className="header__notice">{NON_CALIBRATION_NOTICE}</p>
        </div>
      </div>
    </header>
  );
}

/**
 * The mark: one fundamental diagram, two answers.
 *
 * A solid flow-density curve and a dashed one that peaks lower and later. The
 * app's subject is that the numbers describing this traffic disagree depending
 * on the unit they are measured in, so the mark is the disagreement itself
 * rather than a picture of a vehicle. The two curves must never be equal;
 * equal curves would say the numbers agree.
 *
 * Drawn inline rather than loaded from public/, because it is 300 bytes and a
 * request for the header's own logo is a request the header should not make.
 *
 * This is the small tier. The brand package tiers the mark by size: above
 * 96 px the second curve is dashed, below 48 px the dashes close up into a
 * smear and both curves go solid on a thicker stroke. The header renders at
 * 30 px, so it gets the same art as the favicon, not the art from the 1024 px
 * icon.
 */
function Mark() {
  return (
    <svg className="header__mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" rx="14" fill="var(--paper)" />
      <path
        d="M12 82 Q32 12 88 82"
        fill="none"
        stroke="var(--asphalt)"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M24 84 Q50 56 76 84"
        fill="none"
        stroke="var(--brand-accent)"
        strokeWidth="15"
        strokeLinecap="round"
      />
    </svg>
  );
}
