import type { Vehicle, VehicleType } from '../../sim/types';
import { CANVAS } from './palette';

/**
 * Type is shape (DESIGN.md §2.3).
 *
 * Silhouette at 4 px is enough because the dimensions are genuinely different,
 * and that difference is the app's subject. Shapes are drawn to true scale at
 * the view's metres-per-pixel, so a motorcycle really is a quarter the width of
 * a car rather than being drawn as a smaller icon of one.
 */

/** Below this the marks stop being to scale and the interface says so. */
export const MIN_MARK_PX = 2.5;

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  /** Pixels per metre along the road. */
  scaleX: number;
  /** Pixels per metre across the road. */
  scaleY: number;
}

/**
 * Draw one vehicle, centred at the current transform origin, pointing +x.
 *
 * Heading rotation is applied by the caller. It does an enormous amount of work
 * for one line: a filtering motorcycle angling into a gap reads as intent
 * rather than as sliding sideways, which would read as a bug (DESIGN.md §6.5).
 *
 * Returns false when a minimum size had to be applied, so the caller can tell
 * the user the marks are no longer to scale.
 */
export function drawVehicleBody(
  { ctx, scaleX, scaleY }: DrawContext,
  type: VehicleType,
  length: number,
  width: number,
  fill: string,
): boolean {
  let w = length * scaleX;
  let h = width * scaleY;

  let toScale = true;
  if (w < MIN_MARK_PX) {
    w = MIN_MARK_PX;
    toScale = false;
  }
  if (h < MIN_MARK_PX) {
    h = MIN_MARK_PX;
    toScale = false;
  }

  ctx.fillStyle = fill;

  switch (type) {
    case 'MC': {
      const r = Math.min(h / 2, w / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r);
      else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      break;
    }
    case 'HV': {
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // A division line at the cab, so a bus reads as a bus rather than as a
      // very long car.
      if (w > 12) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = CANVAS.asphalt;
        ctx.fillRect(w / 2 - w * 0.22, -h / 2, Math.max(1, w * 0.02), h);
        ctx.restore();
      }
      break;
    }
    case 'PU': {
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // A notch cut from the kerbside edge — the angkot's doorway, and the
      // reason it stops at the roadside.
      if (w > 8 && h > 4) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(-w * 0.1, h / 2 - h * 0.34, w * 0.3, h * 0.34);
        ctx.restore();
      }
      break;
    }
    case 'LV':
    default:
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
  }

  return toScale;
}

/**
 * Heading from lateral velocity, radians.
 *
 * Clamped, and suppressed at low speed: the ratio explodes as speed approaches
 * zero and a nearly-stopped vehicle would appear to be driving sideways.
 */
export function headingOf(v: Vehicle): number {
  if (v.v < 0.5) return 0;
  return Math.max(-0.5, Math.min(0.5, Math.atan2(v.vLat, v.v)));
}

export const TYPE_LABELS: Record<VehicleType, string> = {
  MC: 'Motorcycle',
  LV: 'Light vehicle',
  HV: 'Heavy vehicle',
  PU: 'Public transport',
};
