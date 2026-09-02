import { useEffect, useRef, useState } from 'react';
import type { World } from '../../sim/types';
import { DT } from '../../sim/types';
import { useCanvas } from '../render/useCanvas';
import { drawCorridor, drawRing, hitTest, type RoadViewport } from './draw';
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
  height: number;
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
}: RoadProps) {
  const { canvasRef, sizeRef } = useCanvas();
  const [toScale, setToScale] = useState(true);
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
      const ok = draw(
        ctx,
        world,
        view,
        freeSpeed,
        alphaRef.current,
        DT,
        selectedVehicle,
      );
      setToScale((prev) => (prev === ok ? prev : ok));
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

  return (
    <div className="road" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="road__canvas"
        // One listener, hit-tested — never a listener per vehicle.
        onClick={(e) => pick(e.clientX, e.clientY)}
        // Fully keyboard operable, including vehicle selection (PRD §9.8).
        tabIndex={0}
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
      {!toScale && (
        <p className="road__note">Marks are enlarged to stay visible — not to scale</p>
      )}
    </div>
  );
}
