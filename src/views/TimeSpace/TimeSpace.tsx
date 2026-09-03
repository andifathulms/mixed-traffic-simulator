import { useEffect, useRef, useState } from 'react';
import type { World } from '../../sim/types';
import { useCanvas } from '../render/useCanvas';
import { TimeSpaceRecorder } from './recorder';
import { backwardWaveSpeed } from '../../sim/analysis';
import type { WaveTracker } from '../../sim/analysis';
import './time-space.css';

export interface TimeSpaceProps {
  worldRef: React.MutableRefObject<World | null>;
  trackerRef: React.MutableRefObject<WaveTracker | null>;
  freeSpeed: number;
  /** Shared position axis with the road, pixel for pixel (DESIGN.md §4.1). */
  viewFrom: number;
  viewTo: number;
  generation: number;
  height: number;
  /** Simulated seconds per pixel row. */
  secondsPerRow?: number;
}

/**
 * The time-space diagram — the hinge between the live view and the record.
 *
 * It shares one horizontal position axis with the road, pixel for pixel. A jam
 * visible as a dark patch in the road sits directly above the backward-leaning
 * stripe that is the same jam in the record. This alignment is the single most
 * important layout decision in the app and nothing may break it.
 */
/**
 * §6.7 Under reduced motion the record renders complete for the elapsed period
 * rather than drawing progressively. The recorder still writes one row per
 * interval, but it catches up in a single pass on each change rather than
 * advancing a row at a time as the paper scrolls.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

export function TimeSpace({
  worldRef,
  trackerRef,
  freeSpeed,
  viewFrom,
  viewTo,
  generation,
  height,
  secondsPerRow = 0.5,
}: TimeSpaceProps) {
  const { canvasRef, sizeRef } = useCanvas();
  const reduced = useReducedMotion();
  const recorderRef = useRef<TimeSpaceRecorder | null>(null);
  const [wave, setWave] = useState<number | null>(null);
  const [span, setSpan] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });
  // Whether the paper is still mostly blank, for the empty state below.
  const [filling, setFilling] = useState(true);

  // A new run gets fresh paper.
  useEffect(() => {
    recorderRef.current?.clear();
  }, [generation]);

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let sinceMeasure = 0;

    const render = () => {
      raf = requestAnimationFrame(render);
      const world = worldRef.current;
      const ctx = canvas.getContext('2d');
      if (!world || !ctx) return;

      const { width, height: h, dpr } = sizeRef.current;
      if (width === 0) return;

      // The recorder's backing store is in device pixels so the record is not
      // resampled on a retina display, which would blur the one-pixel-wide
      // trajectories into mush.
      const bw = Math.round(width * dpr);
      const bh = Math.round(h * dpr);
      let recorder = recorderRef.current;
      if (!recorder || recorder.width !== bw || recorder.height !== bh) {
        recorder = new TimeSpaceRecorder(bw, bh, secondsPerRow);
        recorderRef.current = recorder;
      }

      // With reduced motion the simulation only advances on an explicit step
      // or play, so several intervals may have elapsed between frames. Catch
      // the paper up in one pass rather than one row per animation frame,
      // which would be the progressive drawing the setting asks us not to do.
      let guard = 0;
      while (recorder.observe(world, viewFrom, viewTo, freeSpeed) && reduced && guard++ < 64) {
        // observe() advances one row per call while time remains.
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(recorder.source, 0, 0);

      // The measuring tool: the backward wave speed read off the record
      // (DESIGN.md §5.2). Recomputed a few times a second, not every frame.
      sinceMeasure++;
      if (sinceMeasure > 30) {
        sinceMeasure = 0;
        const tracker = trackerRef.current;
        if (tracker) {
          const after = Math.max(0, world.t - 600);
          setWave(backwardWaveSpeed(tracker.events, world.geometry, after));
        }
        setSpan({ top: recorder.topTime, bottom: recorder.bottomTime });
        // A visible band of paper, not a third of it: the recorder's height is
        // in device pixels, so "a third full" is three minutes of simulated
        // time on a corridor and the hint outstayed its welcome badly.
        const started = recorder.rowsWritten > 24;
        setFilling((prev) => (prev === !started ? prev : !started));
      }
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, worldRef, trackerRef, freeSpeed, viewFrom, viewTo, secondsPerRow, reduced]);

  return (
    <figure className="timespace" style={{ height }}>
      <canvas ref={canvasRef} className="timespace__canvas" aria-hidden="true" />

      <figcaption className="timespace__caption">
        <span className="timespace__axis">
          Position → {Math.round(viewFrom)}–{Math.round(viewTo)} m
        </span>
        <span className="timespace__axis">
          Time ↓ {formatClock(span.top)}–{formatClock(span.bottom)}
        </span>
        {wave !== null && (
          <span className="timespace__wave mono">
            Wave {wave.toFixed(1)} km/h
          </span>
        )}
      </figcaption>

      {/*
        The empty state. A chart recorder with no paper written on it is a blank
        white slab three hundred pixels tall, and a reader who arrives at a
        paused simulation has no way to know it is waiting rather than broken.
        It says what will happen, and goes when it starts happening.
      */}
      {filling && (
        <p className="timespace__empty">
          The paper fills downward as the simulation runs. Trajectories lean with
          speed; a jam is a dark band leaning backward against the flow.
        </p>
      )}

      <p className="visually-hidden">
        Time-space diagram. Vehicle positions are recorded once every{' '}
        {secondsPerRow} seconds, with brightness showing speed. Backward-leaning
        dark stripes are jams travelling against the flow.
        {wave !== null &&
          ` The current backward wave speed is ${wave.toFixed(1)} kilometres per hour.`}
      </p>
    </figure>
  );
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
