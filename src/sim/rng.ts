/**
 * Seeded PRNG — xoshiro128** with a splitmix32 seeder.
 *
 * Determinism is a PRD commitment (§7.3): a surprising result must be
 * reproducible from its seed alone. Math.random is banned everywhere in src/
 * by lint rule; every stochastic decision in the simulation draws from here.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  uniform(lo: number, hi: number): number;
  /** Standard normal, Box–Muller. */
  normal(mean: number, sd: number): number;
  /** Exponential with the given mean — the Poisson arrival process (PRD §4.7). */
  exponential(mean: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Snapshot of internal state, so a world can be cloned exactly. */
  getState(): Uint32Array;
  setState(s: Uint32Array): void;
  /** An independent stream derived from this one — used to keep sub-processes stable. */
  fork(tag: number): Rng;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const seeder = splitmix32(seed >>> 0);
  const s = new Uint32Array([seeder(), seeder(), seeder(), seeder()]);

  // A normal draw produces two values; hold the spare so a stream of draws
  // stays reproducible regardless of how many are consumed per step.
  let spare: number | null = null;

  const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

  const nextUint = (): number => {
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  };

  const rng: Rng = {
    next: () => nextUint() / 4294967296,
    uniform: (lo, hi) => lo + (hi - lo) * rng.next(),
    int: (n) => Math.floor(rng.next() * n),
    normal(mean, sd) {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mean + sd * v;
      }
      // Guard u against exactly zero — log(0) is -Infinity and poisons the draw.
      let u = rng.next();
      if (u < 1e-12) u = 1e-12;
      const v = rng.next();
      const r = Math.sqrt(-2 * Math.log(u));
      const theta = 2 * Math.PI * v;
      spare = r * Math.sin(theta);
      return mean + sd * r * Math.cos(theta);
    },
    exponential(mean) {
      let u = rng.next();
      if (u < 1e-12) u = 1e-12;
      return -mean * Math.log(u);
    },
    getState: () => new Uint32Array([s[0], s[1], s[2], s[3], spare === null ? 0 : 1]),
    setState(state) {
      s[0] = state[0];
      s[1] = state[1];
      s[2] = state[2];
      s[3] = state[3];
      spare = null;
    },
    fork(tag) {
      return createRng((nextUint() ^ Math.imul(tag, 0x9e3779b9)) >>> 0);
    },
  };

  return rng;
}

/** A stable seed from a scenario string, so preset seeds are readable in the URL. */
export function seedFromString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = (h ^ text.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
