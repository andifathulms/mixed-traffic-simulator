import { useRef } from 'react';
import type { ScenarioId } from '../scenarios/types';
import { SCENARIO_ORDER, SCENARIOS } from '../scenarios';

export interface ScenarioRailProps {
  value: ScenarioId;
  onChange: (id: ScenarioId) => void;
}

/**
 * The scenario chooser, as a row of cards.
 *
 * It was a dropdown, which hid the six scenes the app can play behind one
 * name. A visitor arriving on the ring had no way to know there was a
 * signalised junction or an angkot corridor one click away without opening
 * the select. Each card now carries a drawing of its road and one line on
 * what makes it different, so the range of the app is visible before it is
 * explored.
 *
 * A radio group, because exactly one is loaded: arrow keys move and select,
 * and only the checked card is a tab stop (the same roving pattern as the
 * instrument tabs).
 */
export function ScenarioRail({ value, onChange }: ScenarioRailProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (delta: number) => {
    const at = SCENARIO_ORDER.indexOf(value);
    const next = SCENARIO_ORDER[(at + delta + SCENARIO_ORDER.length) % SCENARIO_ORDER.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      className="rail on-dark"
      role="radiogroup"
      aria-label="Scenario"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {SCENARIO_ORDER.map((id) => {
        const checked = id === value;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`rail__card${checked ? ' rail__card--active' : ''}`}
            onClick={() => onChange(id)}
          >
            <Thumb id={id} />
            <span className="rail__text">
              <span className="rail__name">{SCENARIOS[id].name}</span>
              <span className="rail__line">{TAGLINES[id]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** What makes each scene different, in the fewest words that say it. */
const TAGLINES: Record<ScenarioId, string> = {
  'phantom-jam': 'A jam with no cause',
  corridor: '2 km open road',
  bottleneck: 'Width drops 7 → 4 m',
  signal: 'Red light, RHK box',
  angkot: 'Stops on demand',
  bench: 'Every method, swept',
};

/*
 * The thumbnails are drawn in the road's own palette: asphalt, the grey of the
 * markings, and vehicles at the two ends of the headlight ramp. A thumbnail is
 * a picture of the scene, so it speaks the scene's encoding — bright is
 * moving, dark is stopped — rather than decorating with a hue of its own. The
 * bench card is the one exception, and it borrows two estimator colours
 * because it is a picture of the bench.
 */
const FAST = 'var(--speed-100)';
const WARM = 'var(--speed-75)';
const MID = 'var(--speed-50)';
const SLOW = 'var(--speed-25)';
const ROAD = 'var(--surface-raised)';
const EDGE = 'var(--border-dark-strong)';

function Thumb({ id }: { id: ScenarioId }) {
  return (
    <svg className="rail__thumb" viewBox="0 0 48 34" aria-hidden="true" focusable="false">
      {id === 'phantom-jam' && (
        <>
          <circle cx="24" cy="17" r="11" fill="none" stroke={ROAD} strokeWidth="4" />
          <rect x="22" y="4.6" width="4" height="2" rx="0.5" fill={FAST} />
          <rect x="33.6" y="15" width="2" height="4" rx="0.5" fill={WARM} />
          <rect x="12.4" y="15" width="2" height="4" rx="0.5" fill={SLOW} />
          <rect x="15" y="22" width="2" height="4" rx="0.5" fill={SLOW} transform="rotate(-40 16 24)" />
        </>
      )}
      {id === 'corridor' && (
        <>
          <rect x="0" y="10" width="48" height="14" fill={ROAD} />
          <line x1="0" y1="17" x2="48" y2="17" stroke={EDGE} strokeDasharray="3 3" />
          <rect x="5" y="12" width="6" height="3" fill={WARM} />
          <rect x="20" y="19" width="2" height="1.4" fill={FAST} />
          <rect x="26" y="13" width="2" height="1.4" fill={FAST} />
          <rect x="34" y="19" width="7" height="3" fill={WARM} />
          <rect x="15" y="14" width="2" height="1.4" fill={FAST} />
        </>
      )}
      {id === 'bottleneck' && (
        <>
          <path d="M0 8H18L26 13H48V21H26L18 26H0Z" fill={ROAD} />
          <rect x="4" y="11" width="5" height="3" fill={SLOW} />
          <rect x="11" y="18" width="5" height="3" fill={SLOW} />
          <rect x="4" y="18" width="2" height="1.4" fill={SLOW} />
          <rect x="32" y="15" width="5" height="3" fill={FAST} />
        </>
      )}
      {id === 'signal' && (
        <>
          <rect x="0" y="10" width="48" height="14" fill={ROAD} />
          <line x1="32" y1="10" x2="32" y2="24" stroke="var(--marking)" strokeWidth="1.4" />
          <rect x="34" y="4" width="3" height="5" rx="1" fill="var(--signal-red)" />
          <rect x="16" y="12" width="6" height="3" fill={SLOW} />
          <rect x="16" y="18" width="6" height="3" fill={SLOW} />
          <rect x="25" y="13" width="2" height="1.3" fill={MID} />
          <rect x="28" y="15.5" width="2" height="1.3" fill={MID} />
          <rect x="25" y="19" width="2" height="1.3" fill={MID} />
          <rect x="28" y="21" width="2" height="1.3" fill={MID} />
        </>
      )}
      {id === 'angkot' && (
        <>
          <rect x="0" y="10" width="48" height="14" fill={ROAD} />
          <path d="M20 20H26V23H24V22H22V23H20Z" fill={WARM} />
          <circle cx="23" cy="28.5" r="2" fill="none" stroke="var(--marking)" />
          <rect x="5" y="17" width="5" height="3" fill={SLOW} />
          <rect x="33" y="13" width="5" height="3" fill={FAST} />
        </>
      )}
      {id === 'bench' && (
        <>
          <path d="M6 26 L16 20 L26 17 L42 12" fill="none" stroke="var(--method-headway)" strokeWidth="1.6" />
          <path d="M6 22 L16 23 L26 25 L42 29" fill="none" stroke="var(--method-regression)" strokeWidth="1.6" />
          <path d="M6 21 H42" stroke="var(--method-mkji)" strokeDasharray="2 2" />
        </>
      )}
    </svg>
  );
}
