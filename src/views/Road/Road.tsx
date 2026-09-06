import { useEffect, useRef, useState } from 'react';
import type { World } from '../../sim/types';
import { DT } from '../../sim/types';
import { useCanvas } from '../render/useCanvas';
import { TYPE_LABELS } from '../render/vehicle-shape';
import {
  drawCorridor,
  drawRing,
  hitTest,
  MAX_EXAGGERATION,
  type RoadViewport,
} from './draw';
import './road.css';

export interface RoadProps {
  worldRef: React.MutableRefObject<World | null>;
  alphaRef: React.MutableRefObject<number>;
  freeSpeed: number;
  selectedVehicle: number | null;
  onSelect: (id: number | null) => void;
  /** Shared position axis with the time-space diagram (DESIGN.md §4.1). */
  viewFrom: number;
  viewTo: number;
  /** Redraw token, bumped when the world is rebuilt. */
  generation: number;
  /** The most height the road may take. It takes less where it needs less. */
  height: number;
  /** Usable road width in metres, for sizing the band. */
  roadWidth: number;
  /** Rings are drawn as rings and use the whole band they are given. */
  ring: boolean;
}

/**
 * The road — top-down continuous 2D view, the animated centre.
 *
 * Drawn on canvas: 400 vehicles at 60 fps is not a DOM problem.
 */
export function Road({
  worldRef,
  alphaRef,
  freeSpeed,
  selectedVehicle,
  onSelect,
  viewFrom,
  viewTo,
  generation,
  height,
  roadWidth,
  ring,
}: RoadProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const { canvasRef, sizeRef } = useCanvas((w) => setMeasuredWidth(w));
  const [toScale, setToScale] = useState(true);
  const [exaggeration, setExaggeration] = useState(1);
  const viewRef = useRef<RoadViewport | null>(null);

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      raf = requestAnimationFrame(render);
      const world = worldRef.current;
      const ctx = canvas.getContext('2d');
      if (!world || !ctx) return;

      const { width, height: h, dpr } = sizeRef.current;
      if (width === 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const view: RoadViewport = {
        from: viewFrom,
        to: viewTo,
        widthPx: width,
        heightPx: h,
        dpr,
      };
      viewRef.current = view;

      const draw = world.geometry.ring ? drawRing : drawCorridor;
      const report = draw(
        ctx,
        world,
        view,
        freeSpeed,
        alphaRef.current,
        DT,
        selectedVehicle,
      );
      setToScale((prev) => (prev === report.toScale ? prev : report.toScale));
      // Rounded before comparing, so a sub-pixel resize does not re-render.
      const stretch = Math.round(report.exaggeration);
      setExaggeration((prev) => (prev === stretch ? prev : stretch));
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, worldRef, alphaRef, freeSpeed, selectedVehicle, viewFrom, viewTo, generation]);

  const pick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const world = worldRef.current;
    const view = viewRef.current;
    if (!canvas || !world || !view) return;
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(
      world,
      view,
      clientX - rect.left,
      clientY - rect.top,
      world.geometry.ring,
    );
    onSelect(hit ? hit.id : null);
  };

  /*
   * The road takes exactly the height its geometry earns.
   *
   * With the across-road scale capped, a 2 km corridor 7 m wide has about 50 px
   * of carriageway to draw however tall the canvas is — so a 220 px band left
   * 170 px of empty asphalt above and below it. The record below is the more
   * informative view at that length, and it gets the space back.
   */
  const bandHeight =
    measuredWidth > 0 && viewTo > viewFrom
      ? (roadWidth * (measuredWidth / (viewTo - viewFrom)) * MAX_EXAGGERATION) / 0.84
      : height;
  const effectiveHeight = ring
    ? height
    : Math.round(Math.max(96, Math.min(height, bandHeight)));

  /*
   * Named by type and position rather than by id alone: "vehicle 47" tells a
   * reader nothing they can act on, where "motorcycle at 320 metres" places it
   * on the same axis the ruler underneath is measuring.
   */
  const selectionLabel = (() => {
    if (selectedVehicle === null) return '';
    const v = worldRef.current?.vehicles.find((x) => x.id === selectedVehicle);
    if (!v) return '';
    return `Selected ${TYPE_LABELS[v.type].toLowerCase()} at ${Math.round(v.x)} metres, ${(v.v * 3.6).toFixed(0)} kilometres per hour.`;
  })();

  return (
    <div className="road" style={{ height: effectiveHeight }}>
      <canvas
        ref={canvasRef}
        className="road__canvas"
        // One listener, hit-tested — never a listener per vehicle.
        onClick={(e) => pick(e.clientX, e.clientY)}
        // Fully keyboard operable, including vehicle selection (PRD §9.8).
        tabIndex={0}
        /*
         * role="application" so the arrow keys reach this widget at all.
         *
         * A screen reader in its normal reading mode consumes the arrow keys
         * for navigation, which would make the vehicle selection below
         * unreachable for exactly the users who cannot use the mouse
         * alternative. It is the heaviest role in ARIA and it is scoped to
         * this one canvas; the selection it enables is announced through the
         * status line under it, because nothing else in application mode
         * would say what just happened.
         */
        role="application"
        aria-label="Road view. Press left and right arrow keys to select a vehicle."
        onKeyDown={(e) => {
          const world = worldRef.current;
          if (!world || world.vehicles.length === 0) return;
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const ordered = [...world.vehicles].sort((a, b) => a.x - b.x);
          const index = ordered.findIndex((v) => v.id === selectedVehicle);
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const next =
            index === -1
              ? ordered[0]
              : ordered[(index + delta + ordered.length) % ordered.length];
          onSelect(next.id);
        }}
      />
      {/*
        What the arrow keys just did. Inside role="application" the reader is
        out of browse mode, so a changed selection is silent unless it is
        announced; the inspector two panels away updates, but nothing says so.
      */}
      <p className="visually-hidden" role="status">
        {selectionLabel}
      </p>

      {/*
        What the view had to do to fit the road on the screen, said out loud.
        A road is two orders of magnitude longer than it is wide and some
        across-road exaggeration is unavoidable; leaving it unstated would mean
        the reader takes the footprints at face value (DESIGN.md §4.2).
      */}
      {(!toScale || exaggeration > 1) && (
        <p className="road__note">
          {exaggeration > 1 && `Across-road scale ×${exaggeration}`}
          {/* The second clause is the one that goes when there is no room. */}
          {!toScale && (
            <span className="road__note-more">
              {exaggeration > 1 && ' · '}
              marks enlarged to stay visible
            </span>
          )}
        </p>
      )}
    </div>
  );
}
