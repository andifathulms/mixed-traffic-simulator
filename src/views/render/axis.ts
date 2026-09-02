/**
 * The shared position axis (DESIGN.md §4.1).
 *
 * The road view and the time-space diagram are locked to one horizontal
 * position axis, pixel for pixel. A jam at position x in the animation must sit
 * directly above its stripe at position x in the record.
 *
 * Both views call this. Two separate calculations that happen to agree today
 * are two calculations that can drift apart, and this is the alignment the app
 * is built on.
 */
export function positionToPixel(
  x: number,
  from: number,
  to: number,
  widthPx: number,
): number {
  const span = to - from;
  if (span <= 0) return 0;
  return ((x - from) / span) * widthPx;
}

/** Inverse, for hit-testing and the measuring tool. */
export function pixelToPosition(
  px: number,
  from: number,
  to: number,
  widthPx: number,
): number {
  if (widthPx <= 0) return from;
  return from + (px / widthPx) * (to - from);
}
