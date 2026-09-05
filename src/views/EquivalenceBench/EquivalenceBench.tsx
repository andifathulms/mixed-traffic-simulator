import { useMemo } from 'react';
import type { EmpEstimate } from '../../estimators';
import { AGGREGATION_INTERVALS, type AggregationInterval } from '../../estimators';
import { MKJI_MC_EMP, CITATIONS } from '../../sim/defaults';
import { Citation } from '../../ui/Citation';
import { runCount, DEFAULT_REPLICATES } from '../../batch/useSweep';
import {
  SWEEP_COMPARISONS,
  SWEEP_VARIABLES,
  type SweepComparison,
  type SweepVariable,
} from '../../batch/protocol';
import './bench.css';

/** One swept point: a motorcycle fraction and every method's answer at it. */
export interface BenchPoint {
  /** The swept variable's value at this point. The chart's x. */
  value: number;
  mcFraction: number;
  /** Which comparison arm produced it. Empty when nothing is being compared. */
  seriesKey?: string;
  seriesLabel?: string;
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
  variable: SweepVariable;
  onVariableChange: (variable: SweepVariable) => void;
  comparison: SweepComparison;
  onComparisonChange: (comparison: SweepComparison) => void;
  /** Progress of a running sweep, 0..1, or null when idle. */
  progress: number | null;
  onRun: () => void;
  onCancel: () => void;
  width?: number;
  height?: number;
}

const VARIABLE_LABELS: Record<SweepVariable, string> = {
  mcFraction: 'Motorcycle share',
  width: 'Road width',
  inflow: 'Inflow',
  green: 'Green time',
};

const VARIABLE_AXIS: Record<SweepVariable, string> = {
  mcFraction: 'motorcycle share of flow',
  width: 'road width, m',
  inflow: 'inflow, veh/h',
  green: 'green time, s',
};

/** Each swept variable is a different quantity and prints in its own unit. */
function formatSweepValue(variable: SweepVariable, value: number): string {
  switch (variable) {
    case 'mcFraction':
      return `${Math.round(value * 100)}%`;
    case 'width':
      return `${value.toFixed(1)} m`;
    case 'inflow':
      return `${Math.round(value)}`;
    case 'green':
      return `${Math.round(value)} s`;
  }
}

const COMPARISON_LABELS: Record<SweepComparison, string> = {
  none: 'nothing',
  lateralRule: 'lateral rule',
  seed: 'repeat runs',
  station: 'detector station',
  rhk: 'motorcycle stop box',
};

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
/**
 * Lay out the value labels for off-scale estimates.
 *
 * Each series used to place its own label at the point, blind to every other.
 * With five methods and a wide sweep that produced unreadable pile-ups: a
 * value of 6695 printed straight over the axis maximum, and -13.7 and -30.3
 * printed over each other. The estimates themselves are the point of this
 * chart, so the labels are laid out together rather than dropped.
 *
 * Greedy and deterministic: take them left to right, and push a label that
 * would collide further from the axis edge it belongs to. The label always
 * keeps its own x, so it stays attached to its arrow.
 */
interface OffScaleLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end';
}

const LABEL_LINE = 11;

/*
 * Advance width of the 10 px monospace the labels are set in, rounded up.
 * Overestimating separates labels that would have just fitted; underestimating
 * lets two of them touch, which is the failure this layout exists to prevent.
 */
const CHAR_W = 6.4;

/*
 * Clear space demanded between two labels on the same line. Touching is not the
 * only failure: "-13.7" and "-30.3" five pixels apart read as one number.
 */
const LABEL_GAP = 9;

function layOutOffScale(
  raw: { x: number; y: number; text: string; low: boolean }[],
  leftEdge: number,
  rightEdge: number,
): OffScaleLabel[] {
  const placed: OffScaleLabel[] = [];

  for (const item of [...raw].sort((a, b) => a.x - b.x)) {
    const width = item.text.length * CHAR_W;

    // Beside the arrow, flipping to its other side rather than running off the
    // plot. The left flip also keeps a label near x = 0 clear of the tick
    // numbers in the gutter.
    let anchor: 'start' | 'end' = 'start';
    let x = item.x + 6;
    if (x + width > rightEdge) {
      anchor = 'end';
      x = item.x - 6;
    }
    if (anchor === 'start' && item.x - 6 - width < leftEdge && item.x < leftEdge + 4) {
      x = item.x + 6;
    }

    const span = anchor === 'start' ? [x, x + width] : [x - width, x];

    let y = item.low ? item.y - 6 : item.y + 12;
    // Step away from the edge until the box is clear of everything placed.
    for (let guard = 0; guard < 12; guard++) {
      const clash = placed.some((o) => {
        const ospan = o.anchor === 'start'
          ? [o.x, o.x + o.text.length * CHAR_W]
          : [o.x - o.text.length * CHAR_W, o.x];
        const overlapX =
          span[0] < ospan[1] + LABEL_GAP && ospan[0] < span[1] + LABEL_GAP;
        return overlapX && Math.abs(o.y - y) < LABEL_LINE;
      });
      if (!clash) break;
      y += item.low ? -LABEL_LINE : LABEL_LINE;
    }

    placed.push({ x, y, text: item.text, anchor });
  }

  return placed;
}

export function EquivalenceBench({
  points,
  interval,
  onIntervalChange,
  variable,
  onVariableChange,
  comparison,
  onComparisonChange,
  progress,
  onRun,
  onCancel,
  width = 780,
  height = 400,
}: EquivalenceBenchProps) {
  /*
   * A robust axis.
   *
   * Two estimates at minus twenty-nine flattened every other series into a
   * hairline at zero, so a chart whose entire argument is "these four methods
   * disagree, and by how much" showed four coincident lines and two spikes.
   *
   * The window is the fifth to ninety-fifth percentile of the finite values,
   * always widened to contain zero, one and the MKJI constant — the three
   * numbers a reader is comparing against. Nothing is dropped or clamped in the
   * data: a point outside the window is drawn at the edge it left through,
   * marked as off-scale, counted in the note and printed exactly in the table.
   * A negative estimate is reported, never hidden (CLAUDE.md §6).
   */
  const bounds = useMemo(() => {
    const values: number[] = [];
    for (const p of points) {
      for (const s of SERIES) {
        const v = valueOf(p, s.key);
        if (v !== null && Number.isFinite(v)) values.push(v);
      }
    }
    values.sort((a, b) => a - b);
    const quantile = (q: number) =>
      values.length === 0
        ? 0
        : values[Math.min(values.length - 1, Math.round(q * (values.length - 1)))];

    const lo = Math.min(0, MKJI_MC_EMP, quantile(0.05));
    const hi = Math.max(1, MKJI_MC_EMP, quantile(0.95));
    const padding = Math.max(0.1, (hi - lo) * 0.12);
    return { lo: lo - padding, hi: hi + padding };
  }, [points]);

  /*
   * The comparison, collapsed to a band per method.
   *
   * PRD §7.1 asks for the spread rather than a single number when an estimate
   * moves across the lateral rules, and the same argument applies to every
   * other choice the reader can now hold against the sweep. Drawing one line
   * per method per arm would be up to fifteen lines; a band between the lowest
   * and highest arm, with the median drawn through it, says the same thing and
   * can be read.
   *
   * Grouping is by the swept value, so the arms line up at each x.
   */
  const comparing = comparison !== 'none';

  const bands = useMemo(() => {
    const byValue = new Map<number, BenchPoint[]>();
    for (const p of points) {
      const list = byValue.get(p.value) ?? [];
      list.push(p);
      byValue.set(p.value, list);
    }
    const xs = [...byValue.keys()].sort((a, b) => a - b);

    return SERIES.map((series) => {
      const spans = xs.map((x) => {
        const arms = byValue.get(x) ?? [];
        const values = arms
          .map((p) => valueOf(p, series.key))
          .filter((v): v is number => v !== null && Number.isFinite(v))
          .sort((a, b) => a - b);
        if (values.length === 0) return null;
        return {
          x,
          lo: values[0],
          hi: values[values.length - 1],
          mid: values[Math.floor((values.length - 1) / 2)],
          arms: values.length,
        };
      });
      const present = spans.filter((v): v is NonNullable<typeof v> => v !== null);
      const widest = present.reduce((w, v) => Math.max(w, v.hi - v.lo), 0);
      return { series, spans, widest };
    });
  }, [points, comparison]);

  /** The arms actually seen, in first-appearance order, for the caption. */
  const armLabels = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of points) {
      if (p.seriesKey && !seen.has(p.seriesKey)) {
        seen.set(p.seriesKey, p.seriesLabel || p.seriesKey);
      }
    }
    return [...seen.values()];
  }, [points]);

  const pad = { left: 52, right: 12, top: 14, bottom: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  /*
   * The x axis spans the swept variable, whatever it is.
   *
   * It used to be hardwired to motorcycle share from 0 to 0.9, which was
   * correct while that was the only thing the bench could sweep and silently
   * wrong the moment it could sweep road width: every point would have landed
   * on one x.
   */
  const domain = useMemo(() => {
    const vs = points.map((p) => p.value);
    if (vs.length === 0) return { lo: 0, hi: 1 };
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return hi > lo ? { lo, hi } : { lo, hi: lo + 1 };
  }, [points]);

  const px = (value: number) =>
    pad.left + ((value - domain.lo) / (domain.hi - domain.lo)) * plotW;
  const py = (value: number) =>
    pad.top + plotH - ((value - bounds.lo) / (bounds.hi - bounds.lo)) * plotH;

  /** Where a value is drawn, and whether it had to be brought back into view. */
  const place = (value: number) => {
    const clamped = Math.max(bounds.lo, Math.min(bounds.hi, value));
    return { y: py(clamped), offScale: clamped !== value };
  };

  const offScaleCount = points.reduce(
    (n, p) =>
      n +
      SERIES.filter((s) => {
        const v = valueOf(p, s.key);
        return v !== null && (v < bounds.lo || v > bounds.hi);
      }).length,
    0,
  );

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

        <label className="field bench__field">
          <span className="label">Sweep</span>
          <select
            value={variable}
            onChange={(e) => onVariableChange(e.target.value as SweepVariable)}
            disabled={progress !== null}
          >
            {SWEEP_VARIABLES.map((v) => (
              <option key={v} value={v}>
                {VARIABLE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>

        {/*
          The second dimension. Everything in this list is a choice the app
          used to make silently on the reader's behalf, and each one moves the
          answer; that they move it is the app's whole argument.
        */}
        <label className="field bench__field">
          <span className="label">Compare across</span>
          <select
            value={comparison}
            onChange={(e) => onComparisonChange(e.target.value as SweepComparison)}
            disabled={progress !== null}
          >
            {SWEEP_COMPARISONS.map((c) => (
              <option key={c} value={c}>
                {COMPARISON_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        {progress === null ? (
          <>
            <button type="button" className="btn btn--primary" onClick={onRun}>
              {points.length > 0 ? 'Run sweep again' : 'Run sweep'}
            </button>
            {/*
              The size of what is about to start, in runs.

              A count and not a duration on purpose: how long a run takes
              depends on the machine, and a estimate in minutes would be a
              claim that goes stale on hardware I have never seen. The count
              is exact, and the progress bar handles the rest.
            */}
            <span className="bench__cost">
              {runCount(variable, comparison, DEFAULT_REPLICATES, true)} runs
            </span>
          </>
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
          No sweep yet. Running one simulates the corridor across a range of{' '}
          {VARIABLE_AXIS[variable]} and applies every method to each run
          {comparison === 'none'
            ? '.'
            : `, once per ${COMPARISON_LABELS[comparison]}, so the spread each method shows across that choice can be read off the chart.`}
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

          {/*
            The spread, drawn behind the lines. Between the lowest and highest
            arm at each swept value, so a method whose answer barely moves
            across the comparison shows a hairline and one that swings shows a
            slab. That difference is the reading.
          */}
          {comparing &&
            bands.map(({ series, spans }) => {
              const present = spans.filter(
                (v): v is NonNullable<typeof v> => v !== null,
              );
              if (present.length < 2) return null;
              const top = present.map((v) => `${px(v.x).toFixed(1)},${place(v.hi).y.toFixed(1)}`);
              const bottom = present
                .slice()
                .reverse()
                .map((v) => `${px(v.x).toFixed(1)},${place(v.lo).y.toFixed(1)}`);
              return (
                <polygon
                  key={`band-${series.key}`}
                  className="bench__band"
                  points={[...top, ...bottom].join(' ')}
                  fill={series.colour}
                />
              );
            })}

          {/* MKJI's constant, as a flat dashed rule rather than a series —
              it is different in kind from the four estimates. */}
          <line
            className="bench__mkji"
            x1={pad.left}
            y1={py(MKJI_MC_EMP)}
            x2={pad.left + plotW}
            y2={py(MKJI_MC_EMP)}
          />
          {/* Anchored right, where the estimates are least likely to be: at the
              left it sat across both the 0.10 tick and whichever series happened
              to pass through it. */}
          <text
            className="bench__mkji-label"
            x={pad.left + plotW - 4}
            y={py(MKJI_MC_EMP) - 6}
            textAnchor="end"
          >
            MKJI 1997 constant, {MKJI_MC_EMP}
          </text>

          {/* Five ticks across whatever was swept, formatted in its own unit. */}
          {Array.from({ length: 5 }, (_, i) => domain.lo + ((domain.hi - domain.lo) * i) / 4).map(
            (v) => (
              <text
                key={v}
                className="bench__tick"
                x={px(v)}
                y={height - 22}
                textAnchor="middle"
              >
                {formatSweepValue(variable, v)}
              </text>
            ),
          )}
          {[bounds.lo, (bounds.lo + bounds.hi) / 2, bounds.hi].map((v, i) => (
            <text key={i} className="bench__tick" x={pad.left - 6} y={py(v) + 4} textAnchor="end">
              {v.toFixed(2)}
            </text>
          ))}

          <text className="bench__axis-label" x={pad.left + plotW / 2} y={height - 6} textAnchor="middle">
            {VARIABLE_AXIS[variable]}
          </text>

          {/*
            One line per method, drawn from the band's median arm.
            
            Driving the line off the bands rather than off the raw points is
            what keeps a comparison legible: with three arms per swept value
            the raw list holds three entries at each x, and joining them in
            order draws a zigzag between arms instead of a trend. When nothing
            is being compared each value has exactly one arm and the median is
            that value, so this is the same line as before.
          */}
          {bands.map(({ series: s, spans }) => {
            const segment: string[] = [];
            let open = false;
            for (const span of spans) {
              if (span === null) {
                open = false;
                continue;
              }
              segment.push(
                `${open ? 'L' : 'M'}${px(span.x).toFixed(1)},${place(span.mid).y.toFixed(1)}`,
              );
              open = true;
            }
            return (
              <g key={s.key}>
                <path
                  className={`bench__series${s.key === 'truth' ? ' bench__series--truth' : ''}`}
                  d={segment.join('')}
                  stroke={s.colour}
                />
                {spans.map((span, i) => {
                  if (span === null) return null;
                  const v = span.mid;
                  const { y, offScale } = place(v);
                  const x = px(span.x);
                  return (
                    <g key={i}>
                      {offScale ? (
                        /* The arrow marks the edge it left through. Its value is
                           drawn separately, after every series, so the labels can
                           be laid out against one another. */
                        <path
                          className="bench__offscale"
                          d={
                            v < bounds.lo
                              ? `M${x - 4},${y - 5}L${x + 4},${y - 5}L${x},${y}Z`
                              : `M${x - 4},${y + 5}L${x + 4},${y + 5}L${x},${y}Z`
                          }
                          fill={s.colour}
                        />
                      ) : (
                        <circle cx={x} cy={y} r={2.5} fill={s.colour} />
                      )}
                      {/* A point below zero carries a warning marker. */}
                      {v < 0 && (
                        <circle className="bench__warn-marker" cx={x} cy={y} r={6} />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Every off-scale value, laid out against every other. */}
          {layOutOffScale(
            SERIES.flatMap((s) =>
              points.flatMap((p) => {
                const v = valueOf(p, s.key);
                if (v === null) return [];
                const { y, offScale } = place(v);
                if (!offScale) return [];
                return [{ x: px(p.mcFraction), y, text: v.toFixed(1), low: v < bounds.lo }];
              }),
            ),
            pad.left,
            pad.left + plotW,
          ).map((l, i) => (
            <text
              key={i}
              className="bench__offscale-label"
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
            >
              {l.text}
            </text>
          ))}
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

      {/*
        The spread, stated rather than left to be eyeballed off the bands.
        PRD §7.1 asks for this in words: when the estimate moves across the
        comparison, show the spread instead of a single number.
      */}
      {comparing && armLabels.length > 1 && (
        <p className="bench__note">
          Each band spans {armLabels.length} runs, one per{' '}
          {COMPARISON_LABELS[comparison]}: {armLabels.join(', ')}. The line is the
          middle run. Widest spread at any point on the sweep:{' '}
          {bands
            .filter((b) => b.widest > 0)
            .sort((a, b) => b.widest - a.widest)
            .map((b) => `${b.series.label.toLowerCase()} ${b.widest.toFixed(2)}`)
            .join(', ') || 'none — every method returned the same value'}
          . A method whose band is a hairline did not care which{' '}
          {COMPARISON_LABELS[comparison]} it was given; a method whose band is a
          slab was reporting that choice as much as it was reporting the traffic.
        </p>
      )}

      {anyNegative && (
        <p className="bench__warning">
          At least one method returned a negative equivalence. A vehicle cannot
          consume negative road space. The estimator has lost its meaning at
          this interval rather than found a new one. The value is plotted where
          it falls.
        </p>
      )}

      {offScaleCount > 0 && (
        <p className="bench__note">
          {offScaleCount === 1 ? 'One estimate falls' : `${offScaleCount} estimates fall`}{' '}
          outside the axis and {offScaleCount === 1 ? 'is' : 'are'} drawn at the edge with{' '}
          {offScaleCount === 1 ? 'its' : 'their'} value. The axis is set to the bulk of the
          estimates so the methods can be compared; the exact figures are in the table.
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
