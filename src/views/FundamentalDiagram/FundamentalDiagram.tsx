import { useMemo } from 'react';
import type { Interval } from '../../estimators';
import { equilibriumCurve, type FdPoint } from './analytic';
import type { IdmParams } from '../../sim/types';
import './fd.css';

export interface FundamentalDiagramProps {
  intervals: Interval[];
  idm: IdmParams;
  vehicleLength: number;
  effectiveLanes: number;
  width?: number;
  height?: number;
}

/**
 * Flow against density, accumulating live from detector data.
 *
 * SVG rather than canvas: few elements, needs labels and focus, and it is one
 * of the views most likely to be read carefully (CLAUDE.md §7).
 *
 * Points arriving later are drawn at full strength and older points recede
 * toward --ink-faint, so the current state is distinguishable from the
 * accumulated cloud. Watching the cloud grow into the free-flow branch, the
 * capacity peak and the congested branch, rather than being shown the shape,
 * is the point.
 */
export function FundamentalDiagram({
  intervals,
  idm,
  vehicleLength,
  effectiveLanes,
  width = 380,
  height = 260,
}: FundamentalDiagramProps) {
  const points = useMemo<FdPoint[]>(
    () =>
      intervals
        .filter((i) => i.total > 0 && i.spaceMeanSpeed > 0.2)
        .map((i) => ({
          // A single loop cannot measure density directly. The standard
          // substitute is flow divided by space-mean speed, which is exact for
          // stationary flow and approximate otherwise — the approximation is
          // part of what a field engineer lives with.
          k: i.flow / (i.spaceMeanSpeed * 3.6),
          q: i.flow,
          v: i.spaceMeanSpeed,
        })),
    [intervals],
  );

  const curve = useMemo(
    () => equilibriumCurve(idm, vehicleLength, effectiveLanes),
    [idm, vehicleLength, effectiveLanes],
  );

  const maxK = Math.max(60, ...points.map((p) => p.k), ...curve.map((p) => p.k)) * 1.05;
  const maxQ = Math.max(600, ...points.map((p) => p.q), ...curve.map((p) => p.q)) * 1.05;

  const pad = { left: 46, right: 10, top: 12, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const px = (k: number) => pad.left + (k / maxK) * plotW;
  const py = (q: number) => pad.top + plotH - (q / maxQ) * plotH;

  const curvePath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.k).toFixed(1)},${py(p.q).toFixed(1)}`)
    .join('');

  return (
    <figure className="fd on-paper">
      <figcaption className="fd__title">
        Fundamental diagram
        <span className="fd__sub">flow against density, from detectors</span>
      </figcaption>

      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Fundamental diagram. ${points.length} intervals accumulated.`}
      >
        <g className="fd__axes">
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} />
          <line
            x1={pad.left}
            y1={pad.top + plotH}
            x2={pad.left + plotW}
            y2={pad.top + plotH}
          />
        </g>

        {[0, 0.5, 1].map((t) => (
          <text
            key={`k${t}`}
            className="fd__tick"
            x={px(maxK * t)}
            y={height - 18}
            textAnchor="middle"
          >
            {Math.round(maxK * t)}
          </text>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text
            key={`q${t}`}
            className="fd__tick"
            x={pad.left - 6}
            y={py(maxQ * t) + 4}
            textAnchor="end"
          >
            {Math.round(maxQ * t)}
          </text>
        ))}

        <text className="fd__axis-label" x={pad.left + plotW / 2} y={height - 4} textAnchor="middle">
          density, veh/km
        </text>
        <text
          className="fd__axis-label"
          transform={`translate(11,${pad.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          flow, veh/h
        </text>

        {/* The analytic IDM equilibrium, for comparison against what the
            simulation actually produced. */}
        <path className="fd__curve" d={curvePath} />

        {points.map((p, i) => (
          <circle
            key={i}
            className="fd__point"
            cx={px(p.k)}
            cy={py(p.q)}
            r={2}
            // Older points recede so the current state stays distinguishable
            // from the accumulated cloud.
            opacity={0.25 + 0.75 * ((i + 1) / points.length)}
          />
        ))}
      </svg>

      <p className="fd__note">
        The line is the analytic single-lane IDM equilibrium. Where the cloud
        departs from it, the difference is lateral use and heterogeneity — the
        things the closed form does not have.
      </p>

      {/* PRD §9.9 Every instrument has a keyboard-reachable table equivalent. */}
      <details className="fd__table">
        <summary>Table</summary>
        <table>
          <caption className="visually-hidden">
            Flow and density by aggregation interval
          </caption>
          <thead>
            <tr>
              <th scope="col">Density, veh/km</th>
              <th scope="col">Flow, veh/h</th>
              <th scope="col">Speed, km/h</th>
            </tr>
          </thead>
          <tbody>
            {points.slice(-40).map((p, i) => (
              <tr key={i}>
                <td>{p.k.toFixed(1)}</td>
                <td>{Math.round(p.q)}</td>
                <td>{(p.v * 3.6).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
