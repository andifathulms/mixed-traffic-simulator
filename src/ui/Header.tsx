import type { AppState } from '../state/app-state';
import { ScenarioRail } from './ScenarioRail';
import { ThesisStrip } from './ThesisStrip';
import { ShareButton, ViewNav } from './ViewNav';

export interface HeaderProps {
  state: AppState;
  onChange: (patch: Partial<AppState>) => void;
  tuneOpen: boolean;
  onTune: () => void;
}

/**
 * The masthead, in three bands: the name, the scenarios, the thesis.
 *
 * The live readings used to sit here as four digits at the right-hand end.
 * They moved beside the road, where they can carry a trend and be read against
 * the thing they measure. The scenario's own sentence and the non-calibration
 * fact went with them, because they describe the scene on screen rather than
 * the app.
 *
 * What stays is what a stranger needs before anything else: what this is,
 * which scenes it can play, and — as a picture rather than a sentence — why it
 * exists.
 */
export function Header({ state, onChange, tuneOpen, onTune }: HeaderProps) {
  return (
    <header className="header on-dark">
      <div className="header__bar">
        <div className="header__brand">
          <Mark />
          <h1 className="header__title">Mixed traffic simulator</h1>
        </div>
        <ViewNav
          view={state.view}
          onView={(view) => onChange({ view })}
          tuneOpen={tuneOpen}
          onTune={onTune}
        />
        <ShareButton />
      </div>

      <ScenarioRail
        value={state.scenario}
        onChange={(scenario) => onChange({ scenario, selectedVehicle: null })}
      />

      {/*
        The thesis belongs to the first screen. In Measure and Compare the
        reader has already met it, and the space goes to the instruments.
      */}
      {state.view === 'watch' && <ThesisStrip onCompare={() => onChange({ view: 'compare' })} />}
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
