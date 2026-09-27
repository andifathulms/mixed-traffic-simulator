import { useRef, useState } from 'react';
import type { AppView } from '../state/app-state';

export interface ViewNavProps {
  view: AppView;
  onView: (view: AppView) => void;
  tuneOpen: boolean;
  onTune: () => void;
}

const VIEWS: Array<{ id: AppView; label: string; key: string; question: string }> = [
  { id: 'watch', label: 'Watch', key: '1', question: 'See the phenomenon' },
  { id: 'measure', label: 'Measure', key: '2', question: 'Read what the detectors saw' },
  { id: 'compare', label: 'Compare', key: '3', question: 'See the methods disagree' },
];

/**
 * The top-level switch: three places, grouped by the question a reader is
 * asking, and the drawer that changes the experiment.
 *
 * Everything used to be one long scroll with the five instruments sharing a
 * single tab strip, so only one of them could be seen at a time and the bench
 * — the argument — sat below two screens of other things. Each view now fits
 * on one screen, and the keys that reach them are on the buttons.
 *
 * A tablist, with the roving focus and arrow keys that role promises. Tune is
 * not a view but a drawer over whichever view is open, so it is a toggle
 * button beside the list rather than a fourth tab.
 */
export function ViewNav({ view, onView, tuneOpen, onTune }: ViewNavProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <nav className="viewnav" aria-label="Views">
      <div
        className="viewnav__tabs"
        role="tablist"
        aria-label="View"
        onKeyDown={(e) => {
          const order = VIEWS.map((v) => v.id);
          const at = order.indexOf(view);
          const to =
            e.key === 'ArrowRight'
              ? (at + 1) % order.length
              : e.key === 'ArrowLeft'
                ? (at - 1 + order.length) % order.length
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? order.length - 1
                    : -1;
          if (to === -1) return;
          e.preventDefault();
          onView(order[to]);
          refs.current[order[to]]?.focus();
        }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            ref={(el) => {
              refs.current[v.id] = el;
            }}
            type="button"
            role="tab"
            id={`view-${v.id}`}
            aria-selected={view === v.id}
            aria-controls={`panel-view-${v.id}`}
            tabIndex={view === v.id ? 0 : -1}
            title={v.question}
            className={`viewnav__tab${view === v.id ? ' viewnav__tab--active' : ''}`}
            onClick={() => onView(v.id)}
          >
            <span className="kbd" aria-hidden="true">
              {v.key}
            </span>
            {v.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`viewnav__tune${tuneOpen ? ' viewnav__tune--open' : ''}`}
        aria-expanded={tuneOpen}
        aria-controls="tune"
        onClick={onTune}
      >
        <span className="kbd" aria-hidden="true">
          t
        </span>
        Tune
      </button>
    </nav>
  );
}

/**
 * Copy the link that reproduces this run.
 *
 * Every run is linkable (PRD §7.3), and the button used to live at the foot of
 * the parameters panel. It belongs in the masthead, where a reader who has
 * just seen something surprising is looking.
 */
export function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn header__share"
      onClick={() => {
        const done = () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        };
        navigator.clipboard?.writeText(window.location.href).then(done, done);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span aria-live="polite">{copied ? 'Link copied' : 'Share this run'}</span>
    </button>
  );
}
