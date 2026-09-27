/**
 * The speed ramp (DESIGN.md §2.2).
 *
 * Speed is luminance. A stopped vehicle sits at the asphalt's own value and
 * nearly vanishes into the road; a vehicle at free speed is bright. Nothing
 * between them is coloured.
 *
 * The consequence is the app's central image: jams appear as voids. A queue is
 * a dark patch where the road has swallowed its traffic — you find congestion
 * by looking for absence, which is how it looks from the air.
 *
 * Luminance carries the encoding and rises monotonically, so it is
 * colourblind-safe and survives being drawn at 3 px. The top end warms toward
 * headlight cream — free flow glows against the night ground instead of
 * matching the grey road markings — but there is no hue category in it. A
 * red-yellow-green ramp would be the most predictable choice available, fails
 * for a tenth of male users, and would spend hue on what luminance carries.
 */

/** Mirrors --speed-0 through --speed-100 in tokens.css. */
const STOPS: Array<[number, number, number]> = [
  [0x1b, 0x23, 0x2b],
  [0x34, 0x40, 0x4b],
  [0x6f, 0x6e, 0x68],
  [0xc2, 0xb4, 0x8c],
  [0xff, 0xef, 0xc4],
];

/**
 * The same encoding, restated for the paper ground.
 *
 * The dark ramp runs from the asphalt's own value up to near-white, which is
 * exactly wrong on paper: a free-flowing vehicle came out at #E6EBE9 on a
 * #EEEFEB sheet and was invisible (and the headlight cream would be worse). The record showed its jams and nothing else,
 * while DESIGN.md §5.2 promised "near-parallel bright diagonals".
 *
 * So the paper ramp runs from ink to a light grey that is still clearly darker
 * than the paper. The polarity is preserved — a jam is the dark mark on both
 * grounds, which is what makes the road and the record read as one image — and
 * free flow becomes a legible pale diagonal rather than a blank sheet.
 */
const PAPER_STOPS: Array<[number, number, number]> = [
  [0x11, 0x17, 0x19],
  [0x3c, 0x44, 0x47],
  [0x6b, 0x74, 0x75],
  [0x98, 0xa1, 0xa0],
  [0xc0, 0xc8, 0xc6],
];

/** Precomputed ramp, so the road view never mixes colours per vehicle per frame. */
const STEPS = 256;
const TABLE: string[] = new Array(STEPS);

function sample(
  t: number,
  stops: Array<[number, number, number]> = STOPS,
): [number, number, number] {
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const lo = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - lo;
  const a = stops[lo];
  const b = stops[lo + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

for (let i = 0; i < STEPS; i++) {
  const [r, g, b] = sample(i / (STEPS - 1));
  TABLE[i] = `rgb(${r},${g},${b})`;
}

/**
 * Colour for a speed, normalised against the scenario's free-flow speed.
 *
 * The normalisation is stated in the interface, because a 30 km/h scenario and
 * a 60 km/h scenario would otherwise look identical.
 */
export function speedColour(speed: number, freeSpeed: number): string {
  if (freeSpeed <= 0) return TABLE[0];
  const t = Math.max(0, Math.min(1, speed / freeSpeed));
  return TABLE[Math.round(t * (STEPS - 1))];
}

/** The same ramp as raw components, for direct ImageData writes. */
export function speedRgb(speed: number, freeSpeed: number): [number, number, number] {
  return sample(freeSpeed <= 0 ? 0 : speed / freeSpeed);
}

/**
 * The paper ramp as raw components, for the record and the heatmap.
 *
 * Anything drawn on paper must use this one. Using `speedRgb` there is the bug
 * described above and it is not visible in a screenshot of a jam — only in a
 * screenshot of free flow, which looks like an empty sheet.
 */
export function speedRgbOnPaper(
  speed: number,
  freeSpeed: number,
): [number, number, number] {
  return sample(freeSpeed <= 0 ? 0 : speed / freeSpeed, PAPER_STOPS);
}

/** Evenly spaced samples for the legend. */
export const RAMP_SAMPLES = [0, 0.25, 0.5, 0.75, 1].map((t) => speedColour(t, 1));
