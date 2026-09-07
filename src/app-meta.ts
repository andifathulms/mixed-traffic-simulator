/**
 * The app's name and one-line descriptor, in one place.
 *
 * These strings were maintained by hand in three: the on-page header, the
 * document description, and the Open Graph description. Nothing kept them in
 * step, and a share card that has drifted from the page it links to is worse
 * than no share card — the reader is told one thing and shown another.
 *
 * The header renders these directly. index.html carries placeholders that
 * vite.config.ts substitutes at build time from this file, so the page and its
 * metadata cannot disagree.
 *
 * Deliberately free of imports: vite.config.ts loads it during the build, and
 * anything pulled in here would be pulled into the config too.
 */

export const APP_NAME = 'Mixed Traffic Simulator';

/** PRD.md §Descriptor. Kept to one sentence: it is also the share card's text. */
export const APP_DESCRIPTOR =
  'Motorcycle-dominated traffic, and why the numbers that describe it disagree.';

/** Where the built site lives. Used for the canonical link and og:url. */
export const APP_URL = 'https://andifathulms.github.io/mixed-traffic-simulator/';
