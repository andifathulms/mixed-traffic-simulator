import type { World } from '../../sim/types';
import { speedRgb } from '../render/speed-ramp';
import { positionToPixel } from '../render/axis';

/**
 * The time-space recorder.
 *
 * Position on x, time on y increasing downward, one mark per vehicle drawn in
 * the speed ramp so a line's brightness varies along its own length. Free
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
    this.ctx.fillStyle = '#e9eae6';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.written = 0;
    this.lastRowTime = -Infinity;
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
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0xe9;
      data[i + 1] = 0xea;
      data[i + 2] = 0xe6;
      data[i + 3] = 255;
    }

    if (viewTo > viewFrom) {
      for (const v of world.vehicles) {
        // The same mapping the road uses, so the two axes cannot drift apart.
        const px = Math.round(positionToPixel(v.x, viewFrom, viewTo, this.width));
        if (px < 0 || px >= this.width) continue;
        const [r, g, b] = speedRgb(v.v, freeSpeed);
        const i = px * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

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
