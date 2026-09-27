import { useEffect, useMemo, useRef } from 'react';
import type { AppState } from '../state/app-state';
import type { Scenario } from '../scenarios/types';
import type { World } from '../sim/types';
import { NON_CALIBRATION_NOTICE } from '../scenarios';
import { speedColour } from '../views/render/speed-ramp';
import { Citation } from './Citation';

export interface LivePanelProps {
  worldRef: React.MutableRefObject<World | null>;
  scenario: Scenario;
  state: AppState;
  /** Bumped four times a second by the app. */
  tick: number;
  /** Bumped when the world is rebuilt; clears the trend. */
  generation: number;
}

/** Below this a vehicle counts as stopped, m/s. Walking pace is not moving traffic. */
const STOPPED = 0.5;
/** Trend window, simulated seconds. */
const HISTORY = 120;
/** Bins in the speed profile along the road. */
const BINS = 24;
/** Above this many vehicles the stopped count is a bar rather than one dot each. */
const MAX_DOTS = 48;

/**
 * The live readings, beside the road and the record.
 *
 * These were four digits in the masthead, refreshed four times a second with
 * no history. A jam is a change over time, so the one thing the readings most
 * needed to show — speed collapsing — was only visible to someone staring at
 * a number. Each reading now carries its own small picture: mean speed as a
 * trend, stopped vehicles as a count you can see, and speed along the road as
 * a profile whose dip is the jam.
 *
 * The panel sits beside the whole axis column, not beside the road alone, so
 * the road and the record narrow together and keep their shared position axis
 * pixel for pixel (DESIGN.md §4.1).
 *
 * The figures are the fleet's, not the detectors': this is what is happening,
 * not what an observer could measure. The instruments are where the difference
 * between those two becomes the subject.
 */
export function LivePanel({ worldRef, scenario, state, tick, generation }: LivePanelProps) {
  const history = useRef<Array<{ t: number; v: number }>>([]);

  useEffect(() => {
    history.current = [];
  }, [generation]);

  const r = useMemo(() => {
    const world = worldRef.current;
    if (!world) return null;
    const vehicles = world.vehicles;
    const n = vehicles.length;
    let sum = 0;
    let mc = 0;
    let stopped = 0;
    const binSum = new Array<number>(BINS).fill(0);
    const binCount = new Array<number>(BINS).fill(0);
    const L = world.geometry.length;
    for (const v of vehicles) {
      sum += v.v;
      if (v.type === 'MC') mc++;
      if (v.v < STOPPED) stopped++;
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((v.x / L) * BINS)));
      binSum[b] += v.v;
      binCount[b]++;
    }
    const mean = n > 0 ? sum / n : 0;

    // One sample per simulated second, so the trend's time axis is simulated
    // time whatever the speed multiplier.
    const h = history.current;
    const last = h[h.length - 1];
    if (!last || world.t - last.t >= 1 || world.t < last.t) {
      if (last && world.t < last.t) h.length = 0;
      h.push({ t: world.t, v: mean });
      while (h.length > 0 && world.t - h[0].t > HISTORY) h.shift();
    }

    return {
      t: world.t,
      n,
      mean,
      mcShare: n > 0 ? mc / n : 0,
      stopped,
      density: (n / L) * 1000,
      profile: binSum.map((s, i) => (binCount[i] > 0 ? s / binCount[i] : null)),
      speeds: n <= MAX_DOTS ? vehicles.map((v) => v.v) : null,
    };
    // tick is the dependency that matters: the world is a ref and mutates
    // without telling React.
  }, [worldRef, tick]);

  const free = scenario.rampSpeed;

  return (
    <aside className="live on-dark" aria-label="Live readings">
      <div className="live__scenario">
        <h2 className="live__name">{scenario.name}</h2>
        <p className="live__blurb">{scenario.blurb}</p>
        <p className="live__notice">
          {/* PRD §7.4, stated once, as a fact. */}
          {NON_CALIBRATION_NOTICE}
          {scenario.citation && (
            <>
              {' '}
              <Citation dark marker="source" text={scenario.citation} />
            </>
          )}
        </p>
      </div>

      <dl className="live__grid">
        <div className={`live__cell live__clock${state.running ? ' live__clock--running' : ''}`}>
          <dt className="label">Simulated time</dt>
          <dd className="live__figure readout">
            <span className="live__dot" aria-hidden="true" />
            {formatClock(r?.t ?? 0)}
            <span className="live__rate">{state.speed}×</span>
          </dd>
        </div>

        <div className="live__cell live__cell--wide">
          <dt className="label">Mean speed</dt>
          <dd className="live__trend">
            <span className="live__figure readout">
              {r ? (r.mean * 3.6).toFixed(1) : '—'}
              <span className="live__unit"> km/h</span>
            </span>
            <Sparkline values={history.current.map((s) => s.v)} max={free * 1.1} />
          </dd>
        </div>

        <div className="live__cell">
          <dt className="label">Vehicles</dt>
          <dd className="live__small readout">{r ? r.n : '—'}</dd>
        </div>
        <div className="live__cell">
          <dt className="label">Density</dt>
          <dd className="live__small readout">
            {r ? r.density.toFixed(0) : '—'}
            <span className="live__unit"> veh/km</span>
          </dd>
        </div>
        <div className="live__cell">
          <dt className="label">Motorcycles</dt>
          <dd className="live__small readout">
            {r ? (r.mcShare * 100).toFixed(0) : '—'}
            <span className="live__unit"> %</span>
          </dd>
        </div>

        <div className="live__cell live__cell--wide">
          <dt className="label">
            Stopped
            <span className="live__count readout">
              {r ? r.stopped : 0} of {r ? r.n : 0}
            </span>
          </dt>
          <dd className="live__stopped">
            {r?.speeds ? (
              <span className="live__dots" aria-hidden="true">
                {r.speeds.map((v, i) => (
                  <i
                    key={i}
                    className={v < STOPPED ? 'live__stopdot live__stopdot--stopped' : 'live__stopdot'}
                    style={{ background: speedColour(v, free) }}
                  />
                ))}
              </span>
            ) : (
              <span className="live__bar" aria-hidden="true">
                <i style={{ width: `${r && r.n > 0 ? (r.stopped / r.n) * 100 : 0}%` }} />
              </span>
            )}
          </dd>
        </div>

        <div className="live__cell live__cell--wide">
          <dt className="label">
            Speed along the road
            <span className="live__count readout">
              0 → {Math.round(scenario.geometry.length)} m
            </span>
          </dt>
          <dd>
            <Profile bins={r?.profile ?? []} free={free} />
          </dd>
        </div>
      </dl>
    </aside>
  );
}

/** Mean speed over the last two simulated minutes. Area, line, emphasised end. */
function Sparkline({ values, max }: { values: number[]; max: number }) {
  const W = 120;
  const H = 36;
  if (values.length < 2 || max <= 0) {
    return <svg className="live__spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  }
  const step = W / (HISTORY - 1);
  const pts = values.map((v, i) => [i * step, H - 3 - Math.min(1, v / max) * (H - 6)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg className="live__spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="live__spark-area" d={`${line} L${ex.toFixed(1)} ${H} L0 ${H} Z`} />
      <path className="live__spark-line" d={line} vectorEffect="non-scaling-stroke" />
      <circle className="live__spark-end" cx={ex} cy={ey} r={2.6} />
    </svg>
  );
}

/**
 * Mean speed in bins along the road, drawn in the speed ramp. On the ring the
 * jam is the dip that walks backward along it; on a corridor it is the queue.
 */
function Profile({ bins, free }: { bins: Array<number | null>; free: number }) {
  const W = 240;
  const H = 54;
  const bw = W / BINS;
  return (
    <svg className="live__profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line className="live__profile-base" x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} />
      {bins.map((v, i) => {
        if (v === null) return null;
        const h = 3 + Math.min(1, v / free) * (H - 7);
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={H - 1 - h}
            width={bw - 2}
            height={h}
            rx={1}
            fill={speedColour(v, free)}
          />
        );
      })}
    </svg>
  );
}

/** Simulated time, mm:ss. Minutes matter here; hours never arrive. */
function formatClock(t: number): string {
  const total = Math.max(0, Math.floor(t));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
