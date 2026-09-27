/**
 * Canvas colours.
 *
 * Canvas cannot read a CSS custom property, so the values in tokens.css have to
 * exist here too. They were spread across four files as bare hex literals and
 * had already drifted — the heatmap and the time–space recorder were painting
 * two slightly different papers, on plates that sit side by side.
 *
 * One list, mirroring tokens.css. Change a value there and change it here; the
 * comment on each line names the token it mirrors.
 */

export const CANVAS = {
  /** --asphalt: the carriageway surface. */
  asphalt: '#111820',
  /** --asphalt-edge: everything beside it. */
  asphaltEdge: '#0a0f13',
  /** --border-dark-strong: the kerb, drawn as a hairline at the road edge. */
  kerb: '#384753',
  /** --marking: paint on the road, and the detector lines. */
  marking: '#8a99a4',
  /** --select: the selection ring around an inspected vehicle. The accent. */
  select: '#38d1c4',
  /** --paper: the ground the record and the heatmap are drawn on. */
  paper: '#eef1f0',
  /** --signal-green / --signal-amber / --signal-red. The only traffic-light
   *  ramp in the app, used for the one thing it actually means. */
  signal: {
    green: '#3fa66a',
    amber: '#e6a93a',
    red: '#d8453a',
  },
} as const;
