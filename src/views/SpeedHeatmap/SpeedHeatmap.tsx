import { useEffect, useRef } from 'react';
import type { World } from '../../sim/types';
import { useCanvas } from '../render/useCanvas';
import { speedRgbOnPaper } from '../render/speed-ramp';
import { positionToPixel } from '../render/axis';
import { CANVAS } from '../render/palette';
import './heatmap.css';

export interface SpeedHeatmapProps {
  worldRef: React.MutableRefObject<World | null>;
  freeSpeed: number;
  viewFrom: number;
  viewTo: number;
  generation: number;
  /** Simulated seconds per pixel row. */
  secondsPerRow?: number;
  /** Cells across the position axis. */
  columns?: number;
}

/**
 * Position × time, aggregated into cells coloured by mean speed.
 *
 * The macroscopic companion to the microscopic record: same axes as the
 * time-space diagram, but a mean over each cell rather than one mark per
 * vehicle. Useful exactly when vehicle count makes the trajectory plot too
 * dense to read, which is the condition this app's subject matter produces.
 */
export function SpeedHeatmap({
  worldRef,
  freeSpeed,
  viewFrom,
  viewTo,
  generation,
  secondsPerRow = 2,
  columns = 120,
}: SpeedHeatmapProps) {
  const { canvasRef, sizeRef } = useCanvas();
  const stateRef = useRef({ lastRow: -Infinity, written: 0 });
  const bufferRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    stateRef.current = { lastRow: -Infinity, written: 0 };
    const buffer = bufferRef.current;
    if (buffer) {
      const bctx = buffer.getContext('2d')!;
      bctx.fillStyle = CANVAS.paper;
      bctx.fillRect(0, 0, buffer.width, buffer.height);
    }
  }, [generation]);

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sum = new Float64Array(columns);
    const count = new Float64Array(columns);

    const render = () => {
      raf = requestAnimationFrame(render);
      const world = worldRef.current;
      const ctx = canvas.getContext('2d');
      if (!world || !ctx) return;
      const { width, height } = sizeRef.current;
      if (width === 0) return;

      const rows = Math.max(1, Math.round(height));
      let buffer = bufferRef.current;
      if (!buffer || buffer.width !== columns || buffer.height !== rows) {
        buffer = document.createElement('canvas');
        buffer.width = columns;
        buffer.height = rows;
        const bctx = buffer.getContext('2d')!;
        bctx.fillStyle = CANVAS.paper;
        bctx.fillRect(0, 0, columns, rows);
        bufferRef.current = buffer;
        stateRef.current = { lastRow: -Infinity, written: 0 };
      }
      const bctx = buffer.getContext('2d')!;

      const state = stateRef.current;
      if (world.t >= state.lastRow + secondsPerRow) {
        if (world.t < state.lastRow) {
          bctx.fillStyle = CANVAS.paper;
          bctx.fillRect(0, 0, columns, rows);
          state.written = 0;
        }
        state.lastRow = world.t;

        sum.fill(0);
        count.fill(0);
        for (const v of world.vehicles) {
          const col = Math.floor(
            (positionToPixel(v.x, viewFrom, viewTo, columns) / columns) * columns,
          );
          if (col < 0 || col >= columns) continue;
          sum[col] += v.v;
          count[col]++;
        }

        const row = bctx.createImageData(columns, 1);
        for (let c = 0; c < columns; c++) {
          const i = c * 4;
          if (count[c] === 0) {
            // Empty road is paper, not a speed of zero. A cell with no
            // vehicles in it is an absence of measurement, and colouring it as
            // stopped traffic would invent a jam where the road is simply clear.
            row.data[i] = 0xe9;
            row.data[i + 1] = 0xea;
            row.data[i + 2] = 0xe6;
          } else {
            const [r, g, b] = speedRgbOnPaper(sum[c] / count[c], freeSpeed);
            row.data[i] = r;
            row.data[i + 1] = g;
            row.data[i + 2] = b;
          }
          row.data[i + 3] = 255;
        }

        if (state.written < rows) {
          bctx.putImageData(row, 0, state.written);
          state.written++;
        } else {
          bctx.drawImage(buffer, 0, 1, columns, rows - 1, 0, 0, columns, rows - 1);
          bctx.putImageData(row, 0, rows - 1);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const { dpr } = sizeRef.current;
      ctx.drawImage(buffer, 0, 0, Math.round(width * dpr), Math.round(height * dpr));
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, worldRef, freeSpeed, viewFrom, viewTo, secondsPerRow, columns]);

  return (
    <figure className="heatmap on-paper">
      <figcaption className="instrument__head">
        <h3 className="heatmap__title">Speed heatmap</h3>
        <span className="heatmap__sub">
          position × time, mean speed per cell, on the same axes as the record
        </span>
      </figcaption>
      <canvas ref={canvasRef} className="heatmap__canvas" />
      <p className="heatmap__note">
        Blank paper is road with no vehicles on it, not stopped traffic.
      </p>
    </figure>
  );
}
