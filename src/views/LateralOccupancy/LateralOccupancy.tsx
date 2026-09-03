import { useEffect, useState } from 'react';
import type { World, VehicleType } from '../../sim/types';
import { VEHICLE_TYPES } from '../../sim/types';
import { TYPE_LABELS } from '../render/vehicle-shape';
import './lateral.css';

export interface LateralOccupancyProps {
  worldRef: React.MutableRefObject<World | null>;
  ruleName: string;
  width?: number;
  height?: number;
  bins?: number;
}

/*
 * Type here is value, not hue (DESIGN.md §2.4, §5.5).
 *
 * This chart used to borrow the estimator palette — motorcycles in the headway
 * orange, light vehicles in the regression teal. A reader who had learned those
 * colours on the bench two tabs away then met them meaning something else
 * entirely, which is precisely the category error the palette rule exists to
 * prevent. Hue in this app means estimator method or signal aspect.
 *
 * Four stacked bands need four separable marks, so they get four values, and
 * public transport — the lightest, and the one that would otherwise sit close
 * to the plot ground — gets a hatch as well. Motorcycles take the strongest
 * value because they are the subject.
 */
const TYPE_FILL: Record<VehicleType, string> = {
  MC: 'var(--ink)',
  LV: '#5f6664',
  HV: '#99a09c',
  PU: 'url(#lateral-hatch)',
};

/** The legend swatch, which cannot reference an SVG pattern. */
const TYPE_SWATCH: Record<VehicleType, string> = {
  MC: 'var(--ink)',
  LV: '#5f6664',
  HV: '#99a09c',
  PU: 'repeating-linear-gradient(45deg, #5f6664 0 2px, #e4e6e0 2px 4px)',
};

/**
 * A cross-section of the road: where vehicles actually sit laterally, by type.
 *
 * Under strict lanes this shows discrete spikes at lane centres. Under sublane
 * it shows a continuous distribution with motorcycles filling the edges and the
 * interstices. Switching the lateral rule and watching the distribution change
 * from spikes to a smear is the clearest possible statement of what the rule
 * choice does (DESIGN.md §5.5).
 */
export function LateralOccupancy({
  worldRef,
  ruleName,
  width = 780,
  height = 330,
  bins = 56,
}: LateralOccupancyProps) {
  const [snapshot, setSnapshot] = useState<{
    roadWidth: number;
    counts: Record<VehicleType, number[]>;
    total: number;
  }>({
    roadWidth: 7,
    counts: { MC: [], LV: [], HV: [], PU: [] },
    total: 0,
  });

  useEffect(() => {
    // Sampled a few times a second rather than every frame. The distribution
    // is a statistic and it does not need sixty updates a second to read.
    const id = window.setInterval(() => {
      const world = worldRef.current;
      if (!world) return;
      const counts: Record<VehicleType, number[]> = {
        MC: new Array(bins).fill(0),
        LV: new Array(bins).fill(0),
        HV: new Array(bins).fill(0),
        PU: new Array(bins).fill(0),
      };
      for (const v of world.vehicles) {
        // A vehicle occupies a band, not a point. Spreading it across the bins
        // its body covers is what makes this a picture of road usage rather
        // than of centreline positions.
        const lo = Math.max(0, v.y - v.width / 2);
        const hi = Math.min(world.geometry.width, v.y + v.width / 2);
        const loBin = Math.floor((lo / world.geometry.width) * bins);
        const hiBin = Math.min(bins - 1, Math.floor((hi / world.geometry.width) * bins));
        for (let b = loBin; b <= hiBin; b++) counts[v.type][b] += 1;
      }
      setSnapshot({
        roadWidth: world.geometry.width,
        counts,
        total: world.vehicles.length,
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [worldRef, bins]);

  const maxBin = Math.max(
    1,
    ...Array.from({ length: bins }, (_, b) =>
      VEHICLE_TYPES.reduce((s, t) => s + (snapshot.counts[t][b] ?? 0), 0),
    ),
  );

  const pad = { left: 12, right: 12, top: 16, bottom: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const binWidth = plotW / bins;

  return (
    <figure className="lateral on-paper">
      <figcaption className="lateral__head">
        <span className="lateral__title">Lateral occupancy</span>
        <span className="lateral__sub">
          where the width is actually used, by type, under {ruleName}
        </span>
      </figcaption>

      <svg
        className="plot"
        width="100%"
        style={{ maxWidth: width }}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Lateral cross-section of the road under ${ruleName}`}
      >
        <defs>
          <pattern
            id="lateral-hatch"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill="#c9cec9" />
            <rect width="2" height="5" fill="#5f6664" />
          </pattern>
        </defs>

        <rect
          className="lateral__road"
          x={pad.left}
          y={pad.top}
          width={plotW}
          height={plotH}
        />

        {Array.from({ length: bins }, (_, b) => {
          let stack = 0;
          return VEHICLE_TYPES.map((t) => {
            const value = snapshot.counts[t][b] ?? 0;
            if (value === 0) return null;
            const h = (value / maxBin) * plotH;
            const y = pad.top + plotH - stack - h;
            stack += h;
            return (
              <rect
                key={`${b}-${t}`}
                x={pad.left + b * binWidth}
                y={y}
                width={Math.max(1, binWidth - 0.5)}
                height={h}
                fill={TYPE_FILL[t]}
              />
            );
          });
        })}

        <line
          className="lateral__axis"
          x1={pad.left}
          y1={pad.top + plotH}
          x2={pad.left + plotW}
          y2={pad.top + plotH}
        />

        {[0, 0.5, 1].map((t) => (
          <text
            key={t}
            className="lateral__tick"
            x={pad.left + plotW * t}
            y={height - 22}
            textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
          >
            {(snapshot.roadWidth * t).toFixed(1)} m
          </text>
        ))}

        <text
          className="lateral__axis-label"
          x={pad.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
        >
          distance across the carriageway, from the left edge
        </text>
      </svg>

      <ul className="legend lateral__legend">
        {VEHICLE_TYPES.map((t) => (
          <li key={t}>
            <span className="lateral__swatch" style={{ background: TYPE_SWATCH[t] }} />
            {TYPE_LABELS[t]}
          </li>
        ))}
      </ul>

      <details className="instrument__table">
        <summary>Table</summary>
        <table>
          <caption className="visually-hidden">Lateral occupancy by band and type</caption>
          <thead>
            <tr>
              <th scope="col">From, m</th>
              {VEHICLE_TYPES.map((t) => (
                <th key={t} scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: bins }, (_, b) => (
              <tr key={b}>
                <td>{((snapshot.roadWidth * b) / bins).toFixed(2)}</td>
                {VEHICLE_TYPES.map((t) => (
                  <td key={t}>{snapshot.counts[t][b] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
