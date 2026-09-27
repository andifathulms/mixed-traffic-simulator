import type { World } from '../../sim/types';
import { speedRgbOnPaper } from '../render/speed-ramp';
import { positionToPixel } from '../render/axis';
import { CANVAS } from '../render/palette';

/**
 * The time-space recorder.
 *
 * Position on x, time on y increasing downward, each vehicle drawn in the speed
 * ramp so a line's brightness varies along its own length.
 *
 * Each row joins a vehicle's position on this row to where it was on the one
 * before. It used to stamp one pixel per vehicle per row, and a free-flowing
 * vehicle travels tens of pixels between rows — so moving traffic came out as
 * scattered dust and only stopped vehicles, which stay on one pixel and stack
 * into vertical ticks, made anything like a line. The jam bands were there,
 * built from those ticks, but the trajectories they interrupt were not. Free
 * flowing traffic makes near-parallel bright diagonals; a jam makes a dark band
 * leaning backward against the flow, and the slope of that band is the backward
 * wave speed.
 *
 * Drawn incrementally: one row of pixels per simulated interval, appended to an
 * offscreen canvas and scrolled when full. History never redraws, because
 * history does not change. That is both a performance property and the right
 * feeling — it is a chart recorder, and the paper only moves one way.
 */
export class TimeSpaceRecorder {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private row: ImageData;
  /** How many rows have been written since the last reset. */
  private written = 0;
  /** Simulation time of the most recently written row. */
  private lastRowTime = -Infinity;
  /** Each vehicle's pixel on the previous row, so this row can join to it. */
  private previous = new Map<number, number>();
  /** The paper, as the row buffer's clear colour. */
  private readonly paper = hexToRgb(CANVAS.paper);

  readonly width: number;
  readonly height: number;
  /** Simulated seconds per pixel row. */
  secondsPerRow: number;

  constructor(width: number, height: number, secondsPerRow: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.secondsPerRow = secondsPerRow;

    this.canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(this.width, this.height)
        : Object.assign(document.createElement('canvas'), {
            width: this.width,
            height: this.height,
          });

    const ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.ctx = ctx;
    this.row = ctx.createImageData(this.width, 1);
    this.clear();
  }

  clear(): void {
    // Paper ground, so the record reads as a chart rather than as a second road.
    this.ctx.fillStyle = CANVAS.paper;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.written = 0;
    this.lastRowTime = -Infinity;
    this.previous.clear();
  }

  /** The time at the top edge of the visible record. */
  get topTime(): number {
    if (this.written < this.height) return 0;
    return this.lastRowTime - (this.height - 1) * this.secondsPerRow;
  }

  get bottomTime(): number {
    return this.lastRowTime;
  }

  /**
   * Write one row for the current world state, if enough simulated time has
   * passed. Called every frame; it decides for itself whether to draw.
   */
  observe(world: World, viewFrom: number, viewTo: number, freeSpeed: number): boolean {
    if (world.t < this.lastRowTime + this.secondsPerRow) return false;
    // A reset moves time backwards; start the paper again rather than
    // scribbling the new run over the old one.
    if (world.t < this.lastRowTime) this.clear();
    this.lastRowTime = world.t;

    const data = this.row.data;
    // Paper, with every pixel opaque — an unwritten pixel must read as blank
    // paper rather than as transparency over whatever was there before.
    const [pr, pg, pb] = this.paper;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = pr;
      data[i + 1] = pg;
      data[i + 2] = pb;
      data[i + 3] = 255;
    }

    const W = this.width;
    /*
     * Darker wins. On a multi-lane road a motorcycle filtering past a stopped
     * car crosses its pixel in the same row, and a pale free-flow span laid
     * over the dark stopped mark would thin the jam band out of the record.
     * The paper is the lightest value, so it always gives way.
     */
    const paint = (from: number, to: number, r: number, g: number, b: number) => {
      const lo = Math.max(0, Math.min(from, to));
      const hi = Math.min(W - 1, Math.max(from, to));
      const weight = r + g + b;
      for (let x = lo; x <= hi; x++) {
        const i = x * 4;
        if (weight >= data[i] + data[i + 1] + data[i + 2]) continue;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    };

    const seen = new Map<number, number>();
    if (viewTo > viewFrom) {
      const ring = world.geometry.ring;
      for (const v of world.vehicles) {
        // The same mapping the road uses, so the two axes cannot drift apart.
        const px = Math.round(positionToPixel(v.x, viewFrom, viewTo, W));
        seen.set(v.id, px);
        if (px < 0 || px >= W) continue;
        const [r, g, b] = speedRgbOnPaper(v.v, freeSpeed);
        const before = this.previous.get(v.id);

        const wrapped = ring && before !== undefined && before - px > W / 2;
        const jumped = before !== undefined && Math.abs(px - before) > W / 2;

        if (wrapped) {
          // Round the loop: out of the right edge and back in at the left.
          paint(before, W - 1, r, g, b);
          paint(0, px, r, g, b);
        } else if (before === undefined || jumped) {
          // New to the record, or a jump no vehicle makes in one row: a dot.
          paint(px, px, r, g, b);
        } else {
          paint(before, px, r, g, b);
        }
      }
    }
    this.previous = seen;

    if (this.written < this.height) {
      this.ctx.putImageData(this.row, 0, this.written);
      this.written++;
    } else {
      // Scroll by one row. drawImage onto itself is the cheap way to do this
      // and is well defined for a same-canvas copy.
      this.ctx.drawImage(
        this.canvas as CanvasImageSource,
        0,
        1,
        this.width,
        this.height - 1,
        0,
        0,
        this.width,
        this.height - 1,
      );
      this.ctx.putImageData(this.row, 0, this.height - 1);
    }

    return true;
  }

  get source(): CanvasImageSource {
    return this.canvas as CanvasImageSource;
  }

  /** Rows written so far, for the reduced-motion complete render. */
  get rowsWritten(): number {
    return this.written;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
