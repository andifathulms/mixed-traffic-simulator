import { useMemo } from 'react';
import type { ArrivalProcess, LateralRuleId, Params, VehicleType } from '../sim/types';
import { VEHICLE_TYPES } from '../sim/types';
import { composition } from '../sim/demand';
import { createRng } from '../sim/rng';
import { TYPE_LABELS } from '../views/render/vehicle-shape';

/*
 * A drawing for each group in the tune drawer.
 *
 * The settings used to read as settings: "road width 7.0 m", "Poisson". Each
 * group now opens with a small picture of the thing it controls, drawn to
 * scale from the same values the sliders set, so moving a slider changes a
 * picture as well as a number. They are on paper, so they speak the paper's
 * encodings: vehicle type as value (§5.5), never an estimator hue.
 */

const TYPE_FILL: Record<VehicleType, string> = {
  MC: 'var(--type-mc)',
  LV: 'var(--type-lv)',
  HV: 'var(--type-hv)',
  PU: 'var(--type-pu)',
};

/**
 * The carriageway seen from behind, to scale: how many light vehicles fit
 * across it, and how many motorcycles fit in what is left. That remainder is
 * the space the whole app is about.
 */
export function CrossSection({
  width,
  params,
  markings,
  laneCount,
}: {
  width: number;
  params: Params;
  markings: boolean;
  laneCount: number;
}) {
  const W = 360;
  const H = 92;
  const span = Math.max(8, width + 0.6);
  const sc = (W - 16) / span;
  const ox = 8;
  const lv = params.types.LV.width;
  const mc = params.types.MC.width;
  const parking = Math.min(width, params.friction.parkingWidth);

  // Cars first, with a working clearance; motorcycles into the remainder.
  const items: Array<{ type: VehicleType; at: number; w: number }> = [];
  let at = parking + 0.3;
  const carSlots = Math.max(1, Math.floor((width - parking) / 3.2));
  let cars = 0;
  while (cars < carSlots && at + lv <= width - 0.3) {
    items.push({ type: 'LV', at, w: lv });
    at += lv + 0.45;
    cars++;
  }
  let bikes = 0;
  while (at + mc <= width - 0.15) {
    items.push({ type: 'MC', at, w: mc });
    at += mc + 0.3;
    bikes++;
  }

  const ticks = Array.from({ length: Math.floor(span) + 1 }, (_, i) => i);

  return (
    <figure className="tpic">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Road ${width.toFixed(1)} metres wide, seen from behind: ${cars} light vehicles and ${bikes} motorcycles abreast.`}>
        <rect className="tpic__road" x={ox} y={18} width={width * sc} height={52} />
        {parking > 0 && (
          <rect className="tpic__parking" x={ox} y={18} width={parking * sc} height={52} />
        )}
        {markings &&
          laneCount > 1 &&
          Array.from({ length: laneCount - 1 }, (_, i) => {
            const x = ox + ((i + 1) * width * sc) / laneCount;
            return <line key={i} className="tpic__marking" x1={x} y1={20} x2={x} y2={68} />;
          })}
        {items.map((it, i) => (
          <rect
            key={i}
            x={ox + it.at * sc}
            y={it.type === 'LV' ? 28 : 40}
            width={it.w * sc}
            height={it.type === 'LV' ? 36 : 22}
            rx={it.type === 'LV' ? 3 : it.w * sc * 0.45}
            fill={TYPE_FILL[it.type]}
          />
        ))}
        {ticks.map((m) => (
          <line
            key={m}
            className="tpic__tick"
            x1={ox + m * sc}
            y1={74}
            x2={ox + m * sc}
            y2={m % 5 === 0 ? 82 : 78}
          />
        ))}
        <text className="tpic__label" x={ox} y={12}>
          0 m
        </text>
        <text className="tpic__label" x={ox + width * sc} y={12} textAnchor="end">
          {width.toFixed(1)} m
        </text>
      </svg>
      <figcaption className="tpic__caption">
        Seen from behind, to scale.{' '}
        {bikes > 0
          ? `Beside ${cars} ${cars === 1 ? 'car' : 'cars'} there is room for ${bikes} ${bikes === 1 ? 'motorcycle' : 'motorcycles'} abreast.`
          : `${cars === 1 ? 'One car fills' : `${cars} cars fill`} it; nothing fits beside.`}
        {parking > 0 && ' The hatched strip is roadside parking.'}
      </figcaption>
    </figure>
  );
}

/**
 * The four vehicle types, top-down and to scale, with the share of the stream
 * each takes. The lengths are the dimension table's; the shares are what the
 * sliders above produce.
 */
export function FleetStrip({ params }: { params: Params }) {
  const shares = composition(params);
  const W = 360;
  const H = 70;
  // Scaled so the longest vehicle fits a quarter of the strip.
  const longest = Math.max(...VEHICLE_TYPES.map((t) => params.types[t].length));
  const sc = (W / 4 - 18) / longest;

  return (
    <figure className="tpic">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          'Fleet: ' +
          VEHICLE_TYPES.map((t) => `${TYPE_LABELS[t]} ${Math.round(shares[t] * 100)}%`).join(', ')
        }
      >
        {VEHICLE_TYPES.map((t, i) => {
          const { length, width } = params.types[t];
          const x = i * (W / 4) + 4;
          const L = length * sc;
          const w = Math.max(3, width * sc * 1.6);
          const y = 22 - w / 2;
          return (
            <g key={t}>
              {t === 'PU' ? (
                <path
                  d={`M${x} ${y}h${L}v${w}h${-L * 0.35}v${-w * 0.3}h${-L * 0.3}v${w * 0.3}h${-L * 0.35}z`}
                  fill={TYPE_FILL[t]}
                  className="tpic__pu"
                />
              ) : (
                <rect x={x} y={y} width={L} height={w} rx={t === 'MC' ? w / 2 : 2} fill={TYPE_FILL[t]} />
              )}
              {t === 'HV' && (
                <line className="tpic__cab" x1={x + L * 0.18} y1={y} x2={x + L * 0.18} y2={y + w} />
              )}
              <text className="tpic__name" x={x} y={50}>
                {t} · {Math.round(shares[t] * 100)}%
              </text>
              <text className="tpic__label" x={x} y={63}>
                {width.toFixed(1)} × {length.toFixed(1)} m
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

const ARRIVAL_ROWS: Array<{ id: ArrivalProcess; label: string }> = [
  { id: 'poisson', label: 'Poisson' },
  { id: 'uniform', label: 'Uniform' },
  { id: 'platooned', label: 'Platooned' },
];

/**
 * What the three arrival processes look like at the same mean rate: a minute
 * of arrivals each, as ticks. The chosen one is drawn in the accent.
 *
 * Seeded, like everything else in the app, so the picture does not change
 * between renders or between readers.
 */
export function ArrivalStrip({ process }: { process: ArrivalProcess }) {
  const rows = useMemo(() => {
    const rng = createRng(77);
    const x0 = 78;
    const x1 = 352;
    const mean = 14;
    return ARRIVAL_ROWS.map((row) => {
      const ts: number[] = [];
      if (row.id === 'poisson') {
        for (let t = x0 + rng.exponential(mean); t < x1; t += rng.exponential(mean)) ts.push(t);
      } else if (row.id === 'uniform') {
        for (let t = x0 + mean / 2; t < x1; t += mean) ts.push(t);
      } else {
        for (let p = x0 + 12; p < x1; p += 70) {
          for (let q = 0; q < 5; q++) ts.push(p + q * 5 + rng.uniform(0, 2));
        }
      }
      return { ...row, ts };
    });
  }, []);

  return (
    <figure className="tpic">
      <svg viewBox="0 0 360 84" role="img" aria-label="Arrivals over one minute under each process, at the same mean rate.">
        {rows.map((row, r) => {
          const y = 12 + r * 24;
          const on = row.id === process;
          return (
            <g key={row.id} className={on ? 'tpic__arrivals tpic__arrivals--on' : 'tpic__arrivals'}>
              <text className="tpic__name" x={0} y={y + 4}>
                {row.label}
              </text>
              <line className="tpic__axis" x1={78} x2={352} y1={y} y2={y} />
              {row.ts.map((t, i) => (
                <line key={i} className="tpic__arrival" x1={t} x2={t} y1={y - 6} y2={y + 6} />
              ))}
            </g>
          );
        })}
        <text className="tpic__label" x={352} y={82} textAnchor="end">
          same mean inflow, one minute shown
        </text>
      </svg>
    </figure>
  );
}

const RULES: Array<{ id: LateralRuleId; label: string; note: string }> = [
  { id: 'lanes', label: 'Strict lanes', note: 'MOBIL' },
  { id: 'sublane', label: 'Gap-seeking', note: 'sublane' },
  { id: 'social', label: 'Social force', note: 'no traffic citation' },
];

/**
 * The three lateral rules as the distribution each produces across the road:
 * spikes at lane centres, a smear with motorcycles in the edges and gaps, and
 * a looser cloud. The same picture the lateral cross-section draws live, in
 * miniature, so the choice is made by its consequence.
 */
export function LateralRulePicker({
  value,
  onChange,
}: {
  value: LateralRuleId;
  onChange: (rule: LateralRuleId) => void;
}) {
  return (
    <div className="trules" role="radiogroup" aria-label="How vehicles choose where to sit across the road">
      {RULES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={value === r.id}
          className="trule"
          onClick={() => onChange(r.id)}
        >
          <svg viewBox="0 0 90 40" aria-hidden="true" focusable="false">
            <rect className="trule__ground" width="90" height="40" rx="4" />
            {r.id === 'lanes' && (
              <g className="trule__mass">
                <rect x="14" y="4" width="6" height="36" />
                <rect x="42" y="2" width="6" height="38" />
                <rect x="70" y="6" width="6" height="34" />
              </g>
            )}
            {r.id === 'sublane' && (
              <path className="trule__mass" d="M0 40 C8 10 14 6 22 26 C30 38 36 12 46 8 C56 12 62 34 70 28 C78 14 84 18 90 40 Z" />
            )}
            {r.id === 'social' && (
              <path className="trule__mass trule__mass--soft" d="M0 40 C10 18 20 16 30 22 C40 26 50 14 60 16 C72 18 80 22 90 40Z" />
            )}
          </svg>
          <span className="trule__name">{r.label}</span>
          <span className={r.id === 'social' ? 'trule__note trule__note--warn' : 'trule__note'}>
            {r.note}
          </span>
        </button>
      ))}
    </div>
  );
}
