import { describe, it, expect } from 'vitest';
import { positionToPixel, pixelToPosition } from '@/views/render/axis';

describe('the shared position axis (DESIGN.md §4.1)', () => {
  it('maps the view bounds to the canvas bounds', () => {
    expect(positionToPixel(0, 0, 2000, 800)).toBe(0);
    expect(positionToPixel(2000, 0, 2000, 800)).toBe(800);
    expect(positionToPixel(1000, 0, 2000, 800)).toBe(400);
  });

  it('places the same position at the same pixel at any canvas width', () => {
    // The road and the record can have different backing store widths — the
    // record runs at the device pixel ratio. The *fraction* must still agree.
    const roadPx = positionToPixel(1234, 0, 2000, 800);
    const recordPx = positionToPixel(1234, 0, 2000, 1600);
    expect(recordPx / 1600).toBeCloseTo(roadPx / 800, 12);
  });

  it('round-trips through the inverse', () => {
    for (const x of [0, 137.5, 999, 2000]) {
      expect(pixelToPosition(positionToPixel(x, 0, 2000, 800), 0, 2000, 800)).toBeCloseTo(
        x,
        9,
      );
    }
  });

  it('handles a panned window', () => {
    expect(positionToPixel(500, 500, 1500, 1000)).toBe(0);
    expect(positionToPixel(1500, 500, 1500, 1000)).toBe(1000);
  });

  it('does not divide by zero on a degenerate span', () => {
    expect(positionToPixel(5, 100, 100, 800)).toBe(0);
    expect(Number.isFinite(pixelToPosition(5, 100, 100, 0))).toBe(true);
  });
});
