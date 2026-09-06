import { useMemo } from 'react';
import type { DischargeRecord } from '../../sim/discharge';
import { saturationFlow, saturationHeadway } from '../../sim/discharge';
import type { VehicleType } from '../../sim/types';
import './discharge.css';

export interface DischargePlotProps {
  records: readonly DischargeRecord[];
  rhkEnabled: boolean;
  width?: number;
  height?: number;
}

const TYPE_MARK: Record<VehicleType, string> = {
  // Value, not hue — the estimator palette means estimator method and nothing
  // else (DESIGN.md §2.4). The same four values the lateral cross-section
  // uses, so a reader learns one scale for vehicle type and not two. That was
  // written when both instruments carried their own copy of the ramp and the
  // two copies disagreed about public transport; they now read one set of
  // tokens, so the sentence is true.
  MC: 'var(--type-mc)',
  LV: 'var(--type-lv)',
  HV: 'var(--type-hv)',
  PU: 'var(--type-pu)',
};

/**
 * Headway against queue position at the stop line.
 *
 * The saturation headway is the level the series flattens to after the first
 * few positions, which are still accelerating from rest. Both conditions —
 * with and without the advance motorcycle stop box — are shown overlaid, and
 * the app draws no conclusion about which is better (PRD §7.5).
 */
export function DischargePlot({
  records,
  rhkEnabled,
  width = 780,
  height = 360,
}: DischargePlotProps) {
  const stats = useMemo(
    () => ({
      withBox: saturationHeadway(records, true),
      withoutBox: saturationHeadway(records, false),
    }),
    [records],
  );

  const maxPosition = Math.max(12, ...records.map((r) => r.queuePosition));
  const maxHeadway = Math.max(3, ...records.map((r) => r.headway)) * 1.05;

  const pad = { left: 46, right: 12, top: 14, bottom: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const px = (p: number) => pad.left + ((p - 1) / (maxPosition - 1)) * plotW;
  const py = (h: number) => pad.top + plotH - (h / maxHeadway) * plotH;

  return (
    <figure className="discharge on-paper">
      <figcaption className="discharge__head">
        <h3 className="discharge__title">Discharge at the stop line</h3>
        <span className="discharge__sub">
          time headway against position in the discharging queue
        </span>
      </figcaption>

      {records.length === 0 ? (
        <p className="discharge__empty">
          No discharges recorded yet. This instrument measures the signalised
          approach scenario; run it through a few cycles to fill the plot.
        </p>
      ) : (
        <svg
          className="plot"
          width="100%"
          style={{ maxWidth: width }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Discharge headway against queue position"
        >
          <line className="discharge__axis" x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} />
          <line
            className="discharge__axis"
            x1={pad.left}
            y1={pad.top + plotH}
            x2={pad.left + plotW}
            y2={pad.top + plotH}
          />

          {/* The measurement starts at position five, because the first few
              vehicles are still accelerating from rest. */}
          <line
            className="discharge__cut"
            x1={px(5)}
            y1={pad.top}
            x2={px(5)}
            y2={pad.top + plotH}
          />
          <text className="discharge__cut-label" x={px(5) + 4} y={pad.top + 10}>
            saturation measured from here
          </text>

          {records.map((r, i) => (
            <circle
              key={i}
              cx={px(r.queuePosition)}
              cy={py(r.headway)}
              r={r.rhk ? 3 : 2}
              fill={r.rhk ? 'none' : TYPE_MARK[r.type]}
              stroke={r.rhk ? TYPE_MARK[r.type] : 'none'}
              opacity={0.75}
            />
          ))}

          {(['withBox', 'withoutBox'] as const).map((key) => {
            const stat = stats[key];
            if (!stat) return null;
            return (
              <g key={key}>
                <line
                  className={`discharge__sat${key === 'withBox' ? ' discharge__sat--box' : ''}`}
                  x1={px(5)}
                  y1={py(stat.headway)}
                  x2={pad.left + plotW}
                  y2={py(stat.headway)}
                />
              </g>
            );
          })}

          {[1, Math.round(maxPosition / 2), maxPosition].map((p) => (
            <text key={p} className="discharge__tick" x={px(p)} y={height - 22} textAnchor="middle">
              {p}
            </text>
          ))}
          {[0, maxHeadway / 2, maxHeadway].map((h, i) => (
            <text key={i} className="discharge__tick" x={pad.left - 6} y={py(h) + 4} textAnchor="end">
              {h.toFixed(1)}
            </text>
          ))}

          <text className="discharge__axis-label" x={pad.left + plotW / 2} y={height - 6} textAnchor="middle">
            position in queue
          </text>
        </svg>
      )}

      <dl className="figures discharge__stats">
        <div>
          <dt>Without the box</dt>
          {stats.withoutBox ? (
            <dd className="mono">
              {stats.withoutBox.headway.toFixed(2)} s ·{' '}
              {Math.round(saturationFlow(stats.withoutBox.headway))} veh/h
            </dd>
          ) : (
            <dd className="figures__empty">not yet measured</dd>
          )}
        </div>
        <div>
          <dt>With the box (RHK)</dt>
          {stats.withBox ? (
            <dd className="mono">
              {stats.withBox.headway.toFixed(2)} s ·{' '}
              {Math.round(saturationFlow(stats.withBox.headway))} veh/h
            </dd>
          ) : (
            <dd className="figures__empty">not yet measured</dd>
          )}
        </div>
      </dl>

      <p className="discharge__note">
        Hollow marks are cycles with the advance motorcycle stop box enabled,
        solid marks without it. Vehicle type is the mark's value, darkest for
        motorcycles.{' '}
        {stats.withBox && stats.withoutBox
          ? 'Both conditions are shown as measured; the app draws no conclusion about which is preferable.'
          : `Switch the box ${rhkEnabled ? 'off' : 'on'} and run further cycles to compare the two.`}
      </p>

      <details className="instrument__table">
        <summary>Table</summary>
        <table>
          <caption className="visually-hidden">Discharge headways</caption>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">Position</th>
              <th scope="col">Headway, s</th>
              <th scope="col">Type</th>
              <th scope="col">RHK</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(-60).map((r, i) => (
              <tr key={i}>
                <td>{r.cycleIndex}</td>
                <td>{r.queuePosition}</td>
                <td>{r.headway.toFixed(2)}</td>
                <td>{r.type}</td>
                <td>{r.rhk ? 'on' : 'off'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
