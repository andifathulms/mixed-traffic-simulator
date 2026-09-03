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
  asphalt: '#171a1c',
  /** --asphalt-edge: everything beside it. */
  asphaltEdge: '#101314',
  /** --border-dark-strong: the kerb, drawn as a hairline at the road edge. */
  kerb: '#414b4d',
  /** --marking: paint on the road, and the detector lines. */
  marking: '#8e9a9c',
  /** --select: the selection ring around an inspected vehicle. */
  select: '#e6ebe9',
  /** --paper: the ground the record and the heatmap are drawn on. */
  paper: '#eeefeb',
  /** --signal-green / --signal-amber / --signal-red. The only traffic-light
   *  ramp in the app, used for the one thing it actually means. */
  signal: {
    green: '#3e8e5a',
    amber: '#d89a2b',
    red: '#c0392b',
  },
} as const;
