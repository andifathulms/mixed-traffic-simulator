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
 * Achromatic by design. It is colourblind-safe without effort, it survives
 * being drawn at 3 px, and it leaves hue free for the estimator palette. A
 * red-yellow-green ramp would be the most predictable choice available, fails
 * for a tenth of male users, and would spend hue on what luminance carries.
 */

/** Mirrors --speed-0 through --speed-100 in tokens.css. */
const STOPS: Array<[number, number, number]> = [
  [0x20, 0x24, 0x26],
  [0x3f, 0x46, 0x49],
  [0x6d, 0x76, 0x78],
  [0xa3, 0xac, 0xad],
  [0xe6, 0xeb, 0xe9],
];

/** Precomputed ramp, so the road view never mixes colours per vehicle per frame. */
const STEPS = 256;
const TABLE: string[] = new Array(STEPS);

function sample(t: number): [number, number, number] {
  const scaled = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const lo = Math.min(STOPS.length - 2, Math.floor(scaled));
  const f = scaled - lo;
  const a = STOPS[lo];
  const b = STOPS[lo + 1];
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

/** The same ramp as raw components, for direct ImageData writes in the heatmap. */
export function speedRgb(speed: number, freeSpeed: number): [number, number, number] {
  return sample(freeSpeed <= 0 ? 0 : speed / freeSpeed);
}

/** Evenly spaced samples for the legend. */
export const RAMP_SAMPLES = [0, 0.25, 0.5, 0.75, 1].map((t) => speedColour(t, 1));
