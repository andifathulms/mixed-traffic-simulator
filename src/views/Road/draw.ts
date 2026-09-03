import type { Vehicle, World } from '../../sim/types';
import { leftEdgeAt, rightEdgeAt } from '../../sim/geometry';
import { speedColour } from '../render/speed-ramp';
import { drawVehicleBody, headingOf } from '../render/vehicle-shape';
import { positionToPixel } from '../render/axis';
import { CANVAS } from '../render/palette';

export interface RoadViewport {
  /** Metres of road at the left edge of the view. */
  from: number;
  /** Metres of road at the right edge of the view. */
  to: number;
  widthPx: number;
  heightPx: number;
  /** Device pixel ratio already applied to the context. */
  dpr: number;
}

const ASPHALT = CANVAS.asphalt;
const ASPHALT_EDGE = CANVAS.asphaltEdge;
const MARKING = CANVAS.marking;
const SELECT = CANVAS.select;
const KERB = CANVAS.kerb;

/**
 * How far the across-road scale may be stretched relative to the along-road one.
 *
 * A 2 km corridor in 1440 px is 0.72 px per metre. A 7 m road drawn to fill an
 * 185 px band is 26 px per metre — a thirty-six-fold stretch, which turns a
 * 4.4 m car into a 3 × 45 px vertical stick and makes the whole stream look
 * like a picket fence. It was drawing a footprint nobody has.
 *
 * Some exaggeration is unavoidable: a road is two orders of magnitude longer
 * than it is wide, and lateral behaviour is this app's subject. So it is capped
 * and *stated* — the road view says by how much — rather than being applied
 * silently at whatever factor the layout happened to produce.
 */
export const MAX_EXAGGERATION = 10;

/** What the road view needs to tell the reader about how it drew this frame. */
export interface DrawReport {
  /** False when a minimum mark size had to be applied. */
  toScale: boolean;
  /** Across-road stretch relative to along-road. 1 means none. */
  exaggeration: number;
}

export interface RoadBand {
  /** Top of the carriageway in CSS pixels. */
  top: number;
  /** Its height in pixels. */
  height: number;
  /** Pixels per metre across the road. */
  scaleY: number;
  /** How much the across-road scale is stretched relative to along-road. */
  exaggeration: number;
}

/**
 * Where the carriageway sits in the canvas, and at what scale.
 *
 * One function, because the drawing code and the hit test have to agree: two
 * copies of this arithmetic is two copies that can drift, and the symptom would
 * be clicks selecting the wrong vehicle.
 */
export function roadBand(view: RoadViewport, widthMetres: number): RoadBand {
  const scaleX = view.widthPx / (view.to - view.from);
  const available = view.heightPx * 0.84;
  const scaleY = Math.min(available / widthMetres, scaleX * MAX_EXAGGERATION);
  const height = widthMetres * scaleY;
  return {
    top: (view.heightPx - height) / 2,
    height,
    scaleY,
    exaggeration: scaleX > 0 ? scaleY / scaleX : 1,
  };
}

/**
 * Interpolated longitudinal position for smooth drawing.
 *
 * Positions drawn at `x + v·dt·alpha` look smooth; positions drawn at the raw
 * step look juddery even at 60 fps, because at 4x the simulation advances five
 * steps between frames and the vehicle jumps between them (CLAUDE.md §8).
 */
function interpolatedX(v: Vehicle, alpha: number, dt: number): number {
  return v.x + v.v * dt * alpha;
}

/**
 * Draw the corridor, unrolled.
 *
 * The ring scenario is drawn as a ring instead (drawRing), because the ring is
 * the point — a jam travelling backward forever around a closed loop is the
 * demonstration.
 */
export function drawCorridor(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: RoadViewport,
  freeSpeed: number,
  alpha: number,
  dt: number,
  selectedId: number | null,
): DrawReport {
  const { from, to, widthPx, heightPx } = view;
  const span = to - from;
  const scaleX = widthPx / span;
  const toPixel = (x: number) => positionToPixel(x, from, to, widthPx);

  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = ASPHALT_EDGE;
  ctx.fillRect(0, 0, widthPx, heightPx);

  const { geometry } = world;
  const band = roadBand(view, geometry.width);
  const roadTop = band.top;
  const roadHeight = band.height;
  const scaleY = band.scaleY;

  // The carriageway, following the width profile so a bottleneck is visible as
  // a narrowing of the surface rather than as a label.
  ctx.fillStyle = ASPHALT;
  ctx.beginPath();
  const samples = Math.min(400, Math.max(2, Math.round(widthPx / 4)));
  for (let i = 0; i <= samples; i++) {
    const x = from + (span * i) / samples;
    ctx.lineTo(toPixel(x), roadTop + leftEdgeAt(x, geometry) * scaleY);
  }
  for (let i = samples; i >= 0; i--) {
    const x = from + (span * i) / samples;
    ctx.lineTo(toPixel(x), roadTop + rightEdgeAt(x, geometry) * scaleY);
  }
  ctx.closePath();
  ctx.fill();
  // The kerb. The carriageway and the ground beside it differ by seven points
  // of luminance, which is the right relationship in a busy scene and
  // invisible in an empty one — so the edge is drawn, not merely implied. It
  // also makes the width profile legible: a bottleneck is a visible pinch in
  // the outline rather than a shade of black against another shade of black.
  ctx.strokeStyle = KERB;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Markings, where enabled. When they are off the absence should be visible —
  // a bare surface with no lane structure, which is what much of the network
  // actually looks like.
  if (geometry.markings && geometry.laneCount > 1) {
    ctx.strokeStyle = MARKING;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 14]);
    for (let lane = 1; lane < geometry.laneCount; lane++) {
      const y = roadTop + (geometry.width / geometry.laneCount) * lane * scaleY;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Detectors as thin cross-road lines at 40% opacity.
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = MARKING;
  ctx.lineWidth = 1;
  for (const d of world.detectors) {
    if (d.position < from || d.position > to) continue;
    const px = toPixel(d.position);
    ctx.beginPath();
    ctx.moveTo(px, roadTop);
    ctx.lineTo(px, roadTop + roadHeight);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawSignal(ctx, world, view, roadTop, roadHeight);

  let allToScale = true;
  for (const v of world.vehicles) {
    const x = interpolatedX(v, alpha, dt);
    if (x < from - 30 || x > to + 30) continue;

    const px = toPixel(x);
    const py = roadTop + v.y * scaleY;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(headingOf(v));
    const toScale = drawVehicleBody(
      { ctx, scaleX, scaleY },
      v.type,
      v.length,
      v.width,
      speedColour(v.v, freeSpeed),
    );
    if (!toScale) allToScale = false;
    ctx.restore();

    if (v.id === selectedId) {
      ctx.strokeStyle = SELECT;
      ctx.lineWidth = 1.5;
      const rw = Math.max(6, v.length * scaleX) + 6;
      const rh = Math.max(6, v.width * scaleY) + 6;
      ctx.strokeRect(px - rw / 2, py - rh / 2, rw, rh);
    }
  }

  return { toScale: allToScale, exaggeration: band.exaggeration };
}

function drawSignal(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: RoadViewport,
  roadTop: number,
  roadHeight: number,
): void {
  const s = world.signal;
  if (!s) return;
  if (s.position < view.from || s.position > view.to) return;

  const px = positionToPixel(s.position, view.from, view.to, view.widthPx);

  // The RHK box, outlined on the surface with a hatch, exactly as it is
  // painted on real roads.
  if (s.rhk) {
    const boxStart = positionToPixel(s.position - s.rhkDepth, view.from, view.to, view.widthPx);
    const boxWidth = px - boxStart;
    ctx.save();
    ctx.strokeStyle = MARKING;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxStart, roadTop, boxWidth, roadHeight);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (let h = -roadHeight; h < boxWidth; h += 7) {
      ctx.moveTo(boxStart + h, roadTop + roadHeight);
      ctx.lineTo(boxStart + h + roadHeight, roadTop);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxStart, roadTop, boxWidth, roadHeight);
    ctx.clip();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  ctx.strokeStyle = MARKING;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, roadTop);
  ctx.lineTo(px, roadTop + roadHeight);
  ctx.stroke();

  // The aspect as a small bar beside the road — not a floating traffic-light
  // icon (DESIGN.md §5.1).
  const colour =
    s.aspect === 'green'
      ? CANVAS.signal.green
      : s.aspect === 'amber'
        ? CANVAS.signal.amber
        : CANVAS.signal.red;
  ctx.fillStyle = colour;
  ctx.fillRect(px - 2, roadTop - 7, 4, 5);
}

/**
 * Draw the ring scenario as a ring.
 *
 * The time-space diagram unrolls it, and having both simultaneously is
 * precisely the pedagogy (DESIGN.md §4.2).
 */
export function drawRing(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: RoadViewport,
  freeSpeed: number,
  alpha: number,
  dt: number,
  selectedId: number | null,
): DrawReport {
  const { widthPx, heightPx } = view;
  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = ASPHALT_EDGE;
  ctx.fillRect(0, 0, widthPx, heightPx);

  const { geometry } = world;
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const radius = Math.min(widthPx, heightPx) * 0.36;
  // Metres per pixel along the ring, so vehicles are drawn to true scale.
  const circumference = 2 * Math.PI * radius;
  const scaleX = circumference / geometry.length;
  const scaleY = scaleX;
  const roadHalf = (geometry.width * scaleY) / 2;

  ctx.strokeStyle = ASPHALT;
  ctx.lineWidth = geometry.width * scaleY;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Both kerbs, for the same reason the corridor gets one.
  ctx.strokeStyle = KERB;
  ctx.lineWidth = 1;
  for (const r of [radius - roadHalf, radius + roadHalf]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = MARKING;
  ctx.lineWidth = 1;
  for (const d of world.detectors) {
    const angle = (d.position / geometry.length) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - roadHalf), cy + Math.sin(angle) * (radius - roadHalf));
    ctx.lineTo(cx + Math.cos(angle) * (radius + roadHalf), cy + Math.sin(angle) * (radius + roadHalf));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  let allToScale = true;
  for (const v of world.vehicles) {
    const x = interpolatedX(v, alpha, dt);
    const angle = (x / geometry.length) * Math.PI * 2 - Math.PI / 2;
    // y is measured from the outer edge inward, so a vehicle at y = 0 sits on
    // the outside of the ring.
    const r = radius - roadHalf + v.y * scaleY;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2 + headingOf(v));
    const toScale = drawVehicleBody(
      { ctx, scaleX, scaleY },
      v.type,
      v.length,
      v.width,
      speedColour(v.v, freeSpeed),
    );
    if (!toScale) allToScale = false;
    ctx.restore();

    if (v.id === selectedId) {
      ctx.strokeStyle = SELECT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(6, v.length * scaleX * 0.7), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The ring uses one scale for both axes, so nothing is stretched.
  return { toScale: allToScale, exaggeration: 1 };
}

/**
 * Nearest vehicle to a point in view coordinates, or null.
 *
 * One listener on the canvas, hit-tested against a spatial query — never a
 * listener per vehicle (CLAUDE.md §7).
 */
export function hitTest(
  world: World,
  view: RoadViewport,
  px: number,
  py: number,
  isRing: boolean,
): Vehicle | null {
  const { geometry } = world;
  let best: Vehicle | null = null;
  let bestDistance = Infinity;

  if (isRing) {
    const cx = view.widthPx / 2;
    const cy = view.heightPx / 2;
    const radius = Math.min(view.widthPx, view.heightPx) * 0.36;
    const scale = (2 * Math.PI * radius) / geometry.length;
    const roadHalf = (geometry.width * scale) / 2;
    for (const v of world.vehicles) {
      const angle = (v.x / geometry.length) * Math.PI * 2 - Math.PI / 2;
      const r = radius - roadHalf + v.y * scale;
      const d = Math.hypot(cx + Math.cos(angle) * r - px, cy + Math.sin(angle) * r - py);
      if (d < bestDistance) {
        bestDistance = d;
        best = v;
      }
    }
    return bestDistance < 18 ? best : null;
  }

  const band = roadBand(view, geometry.width);
  const roadTop = band.top;
  const scaleY = band.scaleY;

  for (const v of world.vehicles) {
    const vx = positionToPixel(v.x, view.from, view.to, view.widthPx);
    const vy = roadTop + v.y * scaleY;
    const d = Math.hypot(vx - px, vy - py);
    if (d < bestDistance) {
      bestDistance = d;
      best = v;
    }
  }
  return bestDistance < 18 ? best : null;
}
