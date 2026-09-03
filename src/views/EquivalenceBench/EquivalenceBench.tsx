import { useMemo } from 'react';
import type { EmpEstimate } from '../../estimators';
import { AGGREGATION_INTERVALS, type AggregationInterval } from '../../estimators';
import { MKJI_MC_EMP, CITATIONS } from '../../sim/defaults';
import { Citation } from '../../ui/Citation';
import './bench.css';

/** One swept point: a motorcycle fraction and every method's answer at it. */
export interface BenchPoint {
  mcFraction: number;
  truth: number | null;
  headway: EmpEstimate;
  regression: EmpEstimate;
  speed: EmpEstimate;
  occupancy: EmpEstimate;
}

export interface EquivalenceBenchProps {
  points: BenchPoint[];
  interval: AggregationInterval;
  onIntervalChange: (interval: AggregationInterval) => void;
  /** Progress of a running sweep, 0..1, or null when idle. */
  progress: number | null;
  onRun: () => void;
  onCancel: () => void;
  width?: number;
  height?: number;
}

const SERIES = [
  { key: 'truth', label: 'Ground truth (substitution)', colour: 'var(--method-truth)' },
  { key: 'headway', label: 'Time headway', colour: 'var(--method-headway)' },
  { key: 'regression', label: 'Regression', colour: 'var(--method-regression)' },
  { key: 'speed', label: 'Speed', colour: 'var(--method-speed)' },
  { key: 'occupancy', label: 'Occupancy time', colour: 'var(--method-occupancy)' },
] as const;

function valueOf(point: BenchPoint, key: (typeof SERIES)[number]['key']): number | null {
  if (key === 'truth') return point.truth;
  const v = point[key].value;
  return Number.isFinite(v) ? v : null;
}

/**
 * The equivalence bench — five methods against motorcycle fraction, with the
 * MKJI constant drawn as a flat dashed rule.
 *
 * The axis extends below zero, because a negative estimate is a real result and
 * clamping it would hide the app's best finding (DESIGN.md §5.6).
 *
 * The aggregation interval control sits directly on the chart. Changing it
 * re-derives every estimate from the same detector record — no re-simulation —
 * so the series visibly move while ground truth and the MKJI line stay put.
 * That contrast is the whole argument, and it happens in under a second.
 */
export function EquivalenceBench({
  points,
  interval,
  onIntervalChange,
  progress,
  onRun,
  onCancel,
  width = 780,
  height = 400,
}: EquivalenceBenchProps) {
  const bounds = useMemo(() => {
    const values: number[] = [MKJI_MC_EMP, 0, 1];
    for (const p of points) {
      for (const s of SERIES) {
        const v = valueOf(p, s.key);
        if (v !== null && Number.isFinite(v)) values.push(v);
      }
    }
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const padding = Math.max(0.1, (hi - lo) * 0.12);
    return { lo: lo - padding, hi: hi + padding };
  }, [points]);

  const pad = { left: 52, right: 12, top: 14, bottom: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const px = (fraction: number) => pad.left + fraction * plotW;
  const py = (value: number) =>
    pad.top + plotH - ((value - bounds.lo) / (bounds.hi - bounds.lo)) * plotH;

  const zeroY = py(0);
  const showZero = bounds.lo < 0;

  const anyNegative = points.some((p) =>
    SERIES.some((s) => {
      const v = valueOf(p, s.key);
      return v !== null && v < 0;
    }),
  );

  return (
    <figure className="bench on-paper">
      <figcaption className="bench__head">
        <span className="bench__title">Equivalence bench</span>
        <span className="bench__sub">
          motorcycle passenger car equivalent against motorcycle share
        </span>
      </figcaption>

      <div className="bench__controls">
        <fieldset className="bench__intervals">
          <legend>Aggregation interval</legend>
          {/*
            A segmented control, not four loose radios: the whole set is four
            items, and seeing all four at once is what makes it obvious the
            interval is a choice the reader is meant to sweep.
          */}
          <div className="segmented">
            {AGGREGATION_INTERVALS.map((s) => (
              <label key={s} className="segmented__item">
                <input
                  type="radio"
                  name="aggregation"
                  checked={interval === s}
                  onChange={() => onIntervalChange(s)}
                />
                <span>{s / 60} min</span>
              </label>
            ))}
          </div>
        </fieldset>

        {progress === null ? (
          <button type="button" className="btn btn--primary" onClick={onRun}>
            {points.length > 0 ? 'Run sweep again' : 'Run sweep'}
          </button>
        ) : (
          <span className="bench__progress">
            <progress value={progress} max={1} />
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </span>
        )}
      </div>

      {points.length === 0 ? (
        <p className="bench__empty">
          No sweep yet. Running one simulates the corridor across motorcycle
          shares from 0 to 90 per cent and applies every method to each run.
        </p>
      ) : (
        <svg
          className="plot"
          width="100%"
          style={{ maxWidth: width }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Equivalence estimates by method against motorcycle share"
        >
          {/* Gridlines first, so every mark that means something is drawn
              over the furniture rather than through it. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              className="plot__grid"
              x1={pad.left}
              y1={pad.top + f * plotH}
              x2={pad.left + plotW}
              y2={pad.top + f * plotH}
            />
          ))}

          <line
            className="bench__axis"
            x1={pad.left}
            y1={pad.top}
            x2={pad.left}
            y2={pad.top + plotH}
          />

          {/* The axis extends below zero and says so. A point below this line
              is not an error to be tidied away. */}
          {showZero && (
            <>
              <line
                className="bench__zero"
                x1={pad.left}
                y1={zeroY}
                x2={pad.left + plotW}
                y2={zeroY}
              />
              <text className="bench__tick" x={pad.left - 6} y={zeroY + 4} textAnchor="end">
                0
              </text>
            </>
          )}

          <line
            className="bench__axis"
            x1={pad.left}
            y1={pad.top + plotH}
            x2={pad.left + plotW}
            y2={pad.top + plotH}
          />

          {/* MKJI's constant, as a flat dashed rule rather than a series —
              it is different in kind from the four estimates. */}
          <line
            className="bench__mkji"
            x1={pad.left}
            y1={py(MKJI_MC_EMP)}
            x2={pad.left + plotW}
            y2={py(MKJI_MC_EMP)}
          />
          <text className="bench__mkji-label" x={pad.left + plotW - 4} y={py(MKJI_MC_EMP) - 5} textAnchor="end">
            MKJI 1997 constant, {MKJI_MC_EMP}
          </text>

          {[0, 0.25, 0.5, 0.75, 0.9].map((f) => (
            <text key={f} className="bench__tick" x={px(f)} y={height - 22} textAnchor="middle">
              {Math.round(f * 100)}%
            </text>
          ))}
          {[bounds.lo, (bounds.lo + bounds.hi) / 2, bounds.hi].map((v, i) => (
            <text key={i} className="bench__tick" x={pad.left - 6} y={py(v) + 4} textAnchor="end">
              {v.toFixed(2)}
            </text>
          ))}

          <text className="bench__axis-label" x={pad.left + plotW / 2} y={height - 6} textAnchor="middle">
            motorcycle share of flow
          </text>

          {SERIES.map((s) => {
            const segment: string[] = [];
            let open = false;
            for (const p of points) {
              const v = valueOf(p, s.key);
              if (v === null) {
                open = false;
                continue;
              }
              segment.push(`${open ? 'L' : 'M'}${px(p.mcFraction).toFixed(1)},${py(v).toFixed(1)}`);
              open = true;
            }
            return (
              <g key={s.key}>
                <path
                  className={`bench__series${s.key === 'truth' ? ' bench__series--truth' : ''}`}
                  d={segment.join('')}
                  stroke={s.colour}
                />
                {points.map((p, i) => {
                  const v = valueOf(p, s.key);
                  if (v === null) return null;
                  return (
                    <g key={i}>
                      <circle cx={px(p.mcFraction)} cy={py(v)} r={2.5} fill={s.colour} />
                      {/* A point below zero carries a warning marker. */}
                      {v < 0 && (
                        <circle
                          className="bench__warn-marker"
                          cx={px(p.mcFraction)}
                          cy={py(v)}
                          r={6}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      <ul className="legend bench__legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="bench__swatch" style={{ background: s.colour }} />
            {s.label}
          </li>
        ))}
        <li>
          <span className="bench__swatch bench__swatch--mkji" />
          MKJI 1997 constant{' '}
          <Citation marker="source" text={CITATIONS.mkjiEmp.text} />
        </li>
      </ul>

      {anyNegative && (
        <p className="bench__warning">
          At least one method returned a negative equivalence. A vehicle cannot
          consume negative road space — the estimator has lost its meaning at
          this interval rather than found a new one. The value is plotted where
          it falls.
        </p>
      )}

      <Warnings points={points} />

      <details className="instrument__table">
        <summary>Table</summary>
        <table>
          <caption className="visually-hidden">
            Equivalence by method and motorcycle share
          </caption>
          <thead>
            <tr>
              <th scope="col">MC share</th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{Math.round(p.mcFraction * 100)}%</td>
                {SERIES.map((s) => {
                  const v = valueOf(p, s.key);
                  return <td key={s.key}>{v === null ? '—' : v.toFixed(3)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Warnings({ points }: { points: BenchPoint[] }) {
  const messages = useMemo(() => {
    const seen = new Set<string>();
    for (const p of points) {
      for (const key of ['headway', 'regression', 'speed', 'occupancy'] as const) {
        for (const w of p[key].warnings) seen.add(`${p[key].method}: ${w}`);
      }
    }
    return [...seen].slice(0, 6);
  }, [points]);

  if (messages.length === 0) return null;
  return (
    <ul className="bench__warnings">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
