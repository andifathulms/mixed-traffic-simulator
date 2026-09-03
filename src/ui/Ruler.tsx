import { useMemo } from 'react';

export interface RulerProps {
  /** The shared position axis, in metres (DESIGN.md §4.1). */
  from: number;
  to: number;
  /** True when the road above is drawn as a ring rather than unrolled. */
  ring: boolean;
}

/**
 * The position ruler, between the road and the record.
 *
 * The app's central alignment — a jam in the animation sits directly above its
 * stripe in the record — was true before but invisible: the two canvases were
 * simply butted together and the reader had to take the correspondence on
 * trust. The ruler states it. It is the same axis, so it is drawn from the
 * same two numbers, positioned by percentage, which is the identical linear map
 * the canvases use (positionToPixel) with no second calculation to drift.
 *
 * On the ring scenario the label says so, because there "position" means
 * distance around a loop and 0 m and L m are the same place.
 */
export function Ruler({ from, to, ring }: RulerProps) {
  const ticks = useMemo(() => niceTicks(from, to), [from, to]);
  const span = to - from;

  return (
    <div className="ruler on-dark" aria-hidden="true">
      {ticks.map((x) => (
        <span
          key={x}
          className="ruler__tick"
          style={{ left: `${((x - from) / span) * 100}%` }}
        >
          <span className="ruler__label mono">{formatMetres(x)}</span>
        </span>
      ))}
      <span className="ruler__unit label">
        {ring ? 'position around the ring, m' : 'position, m'}
      </span>
    </div>
  );
}

/** Round tick positions at 1, 2 or 5 times a power of ten, about eight of them. */
function niceTicks(from: number, to: number): number[] {
  const span = to - from;
  if (span <= 0) return [];
  const raw = span / 8;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;

  const out: number[] = [];
  for (let x = Math.ceil(from / step) * step; x < to; x += step) out.push(Math.round(x));
  return out;
}

function formatMetres(x: number): string {
  return x >= 1000 ? `${(x / 1000).toFixed(x % 1000 === 0 ? 0 : 1)}k` : String(x);
}
