import { APP_DESCRIPTOR } from '../app-meta';
import { Citation } from './Citation';

/**
 * The thesis, as a picture, on the first screen.
 *
 * The app's argument — the equivalence factor everyone quotes is an artefact
 * of the method that measured it — used to be reachable only by scrolling to
 * the bench and running a sweep. The published values are the evidence that
 * the argument is worth having, and they are static, so they can be on screen
 * from the first frame: eight field measurements of one "constant", spread
 * from below zero to 0.84, against the two MKJI values planning actually uses.
 *
 * These are literature values (PRD §1), not simulation output, and the
 * citation marker says where they come from.
 */

interface Measurement {
  value: number;
  label: string;
  /** Label row: negative rows sit above the axis, positive below. */
  row: -3 | -2 | -1 | 1 | 2;
  anchor: 'start' | 'end';
  /** Kept on narrow screens, where only the extremes fit. */
  major?: boolean;
  /** A range rather than a point. */
  to?: number;
  /** "or higher" — drawn with an arrow. */
  open?: boolean;
}

const MEASUREMENTS: Measurement[] = [
  { value: -0.11, label: 'Denpasar, 1 h aggregation', row: -2, anchor: 'start', major: true },
  { value: 0.1, label: 'Denpasar, 15 min', row: 1, anchor: 'end' },
  { value: 0.11, label: 'Denpasar, 3 min', row: -3, anchor: 'start' },
  { value: 0.198, label: 'intercity four-lane', row: 2, anchor: 'start' },
  { value: 0.32, label: 'roundabout, occupancy time', row: 1, anchor: 'start' },
  { value: 0.35, to: 0.36, label: 'Solo–Sragen', row: -1, anchor: 'start' },
  { value: 0.4, label: 'Semarang', row: -3, anchor: 'start', open: true },
  { value: 0.84, label: 'rural road, time headway', row: 1, anchor: 'end', major: true },
];

const MKJI = [0.25, 0.5];

const SOURCE =
  'Published Indonesian field measurements of motorcycle passenger car ' +
  'equivalence: 0.198 on an intercity four-lane road; 0.32 at a roundabout by ' +
  'occupancy time; 0.35–0.36 on Solo–Sragen; 0.4 or higher argued for in ' +
  'Semarang; 0.84 on a rural road by time headway; and, in one Denpasar ' +
  'regression study, 0.11, 0.10 and −0.11 at 3-minute, 15-minute and 1-hour ' +
  'aggregation. MKJI 1997 assigns 0.25 or 0.5 depending on road type.';

// The plot's own coordinate frame. The SVG scales to its box; text inside it
// is sized for the wide layout and the narrow one hides the minor labels.
const W = 1000;
const AXIS_Y = 80;
const X0 = 40;
const X1 = 960;
const MIN = -0.2;
const MAX = 0.9;
const x = (v: number) => X0 + ((v - MIN) / (MAX - MIN)) * (X1 - X0);
const rowY = (row: number) => (row < 0 ? AXIS_Y + row * 20 : AXIS_Y + 14 + row * 20);

/** As published: two places unless the source gave three, true minus sign. */
const fmt = (v: number) => {
  const a = Math.abs(v);
  const s = Number.isInteger(Math.round(a * 1000) / 10) ? a.toFixed(2) : String(a);
  return v < 0 ? `−${s}` : s;
};

export function ThesisStrip() {
  return (
    <section className="thesis on-dark" aria-labelledby="thesis-title">
      <div className="thesis__text">
        <p className="thesis__descriptor">{APP_DESCRIPTOR}</p>
        <h2 className="thesis__title" id="thesis-title">
          The number everyone quotes has been measured from{' '}
          <span className="thesis__figure">−0.11</span> to{' '}
          <span className="thesis__figure">0.84</span>.
        </h2>
        <p className="thesis__links">
          <Citation dark marker="source" text={SOURCE} />
          <a className="thesis__jump" href="#instruments">
            Compare the five methods ↓
          </a>
        </p>
      </div>

      <svg
        className="thesis__plot"
        viewBox={`0 0 ${W} 164`}
        role="img"
        aria-label={
          'Published motorcycle equivalence values: ' +
          MEASUREMENTS.map((m) => `${fmt(m.value)}, ${m.label}`).join('; ') +
          '. MKJI 1997 uses 0.25 and 0.5.'
        }
      >
        {/* Below zero is physically meaningless, and is shaded as such. */}
        <rect className="thesis__negative" x={X0} y={AXIS_Y - 14} width={x(0) - X0} height={28} />
        <line className="thesis__axis" x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} />

        {MKJI.map((v) => (
          <g key={v}>
            <line className="thesis__mkji" x1={x(v)} y1={AXIS_Y - 18} x2={x(v)} y2={AXIS_Y + 18} />
            <text className="thesis__tick" x={x(v)} y={160} textAnchor="middle">
              <tspan className="thesis__tick-long">MKJI 1997 · </tspan>
              {v}
            </text>
          </g>
        ))}
        <text className="thesis__tick" x={x(0)} y={160} textAnchor="middle">
          0
        </text>
        <line className="thesis__zero" x1={x(0)} y1={AXIS_Y - 8} x2={x(0)} y2={AXIS_Y + 8} />

        {MEASUREMENTS.map((m) => {
          const cx = x(m.value);
          const ly = rowY(m.row);
          const negative = m.value < 0;
          return (
            <g key={m.label} className={m.major ? 'thesis__m thesis__m--major' : 'thesis__m'}>
              <line
                className="thesis__leader"
                x1={cx}
                y1={AXIS_Y}
                x2={cx}
                y2={m.row < 0 ? ly + 4 : ly - 12}
              />
              <text className="thesis__label" x={m.anchor === 'start' ? cx + 4 : cx - 4} y={ly} textAnchor={m.anchor}>
                <tspan className={negative ? 'thesis__val thesis__val--neg' : 'thesis__val'}>
                  {m.open ? '≥ ' : ''}
                  {fmt(m.value)}
                  {m.to !== undefined ? `–${m.to}` : ''}
                </tspan>
                {'  '}
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Points last, so no leader line crosses a point. */}
        {MEASUREMENTS.map((m) => {
          const cx = x(m.value);
          if (m.to !== undefined) {
            return (
              <rect
                key={`p-${m.label}`}
                className="thesis__point thesis__point--range"
                x={cx - 3}
                y={AXIS_Y - 5}
                width={x(m.to) - cx + 6}
                height={10}
                rx={3}
              />
            );
          }
          if (m.value < 0) {
            return (
              <g key={`p-${m.label}`}>
                <circle className="thesis__halo" cx={cx} cy={AXIS_Y} r={11} />
                <circle className="thesis__point thesis__point--neg" cx={cx} cy={AXIS_Y} r={6} />
              </g>
            );
          }
          return (
            <g key={`p-${m.label}`}>
              <circle className="thesis__point" cx={cx} cy={AXIS_Y} r={5} />
              {m.open && (
                <path className="thesis__open" d={`M${cx + 7} ${AXIS_Y} h10 m-4 -4 l4 4 -4 4`} />
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
