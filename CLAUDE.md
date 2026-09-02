# CLAUDE.md — Mixed Traffic Simulator

Build instructions for Claude Code. PRD.md is what and why. DESIGN.md is how it looks.

## Non-negotiables

1. **Fixed timestep, decoupled from render.** Physics at 0.05 s. Accumulate frame time and
   step the simulation as many times as needed. A variable timestep tied to frame rate makes
   results depend on the user's hardware and invalidates every number in the app.
2. **Seeded PRNG everywhere.** No `Math.random()` anywhere in `src/`. One seeded generator
   threaded through the simulation. Determinism is a PRD commitment and it is what makes
   batch sweeps meaningful.
3. **Estimators cannot see vehicle state.** `src/estimators/` must not import from
   `src/sim/`. Enforce with an ESLint `no-restricted-imports` rule that fails the build.
   This is structural integrity, not style.
4. **The engine is pure and headless.** `src/sim/` imports nothing — no React, no DOM, no
   `Math.random`, no `Date`. It runs under `node --test` and in a worker unchanged.
5. **Collisions are bugs.** Assert no overlap every step in development builds. In
   production, surface a numerical warning rather than rendering overlapping vehicles.
6. **No network at runtime.**

## Stack

- Vite + React 18 + TypeScript, strict.
- Plain CSS with custom properties.
- No physics library, no charting library, no simulation framework.
- Rendering: **canvas** for the road, the time–space diagram, and the speed heatmap. SVG for
  the fundamental diagram, the equivalence bench, the discharge plot, and the lateral
  cross-section. Rationale in §7.
- Web Worker for batch sweeps only. The interactive simulation runs on the main thread — at
  400 vehicles it is well inside budget and a worker would add latency to every control.
- Vitest.

## Layout

```
/
├─ src/
│  ├─ sim/
│  │  ├─ rng.ts               # seeded PRNG (xoshiro128** or PCG)
│  │  ├─ types.ts             # Vehicle, VehicleType, World, Params
│  │  ├─ idm.ts               # longitudinal acceleration
│  │  ├─ lateral/
│  │  │  ├─ lanes.ts          # strict lanes + MOBIL
│  │  │  ├─ sublane.ts        # gap-seeking continuous lateral
│  │  │  └─ social.ts         # repulsive potentials
│  │  ├─ neighbours.ts        # spatial index, leader/follower queries
│  │  ├─ signal.ts            # fixed-time controller, RHK stop lines
│  │  ├─ friction.ts          # side friction events
│  │  ├─ demand.ts            # arrival processes
│  │  ├─ geometry.ts          # width profile, bottlenecks, gradient
│  │  ├─ detectors.ts         # virtual loops — the ONLY estimator input
│  │  ├─ world.ts             # the step function
│  │  └─ index.ts
│  ├─ estimators/             # MUST NOT import from sim/
│  │  ├─ detector-record.ts   # the shared boundary type
│  │  ├─ headway.ts
│  │  ├─ regression.ts
│  │  ├─ speed.ts
│  │  ├─ occupancy.ts
│  │  └─ index.ts
│  ├─ truth/
│  │  └─ substitution.ts      # controlled capacity experiment — MAY import sim/
│  ├─ scenarios/              # preset definitions, one file each
│  ├─ views/
│  │  ├─ Road/
│  │  ├─ TimeSpace/
│  │  ├─ SpeedHeatmap/
│  │  ├─ FundamentalDiagram/
│  │  ├─ LateralOccupancy/
│  │  ├─ EquivalenceBench/
│  │  ├─ DischargePlot/
│  │  └─ Inspector/
│  ├─ batch/
│  │  └─ sweep.worker.ts
│  ├─ state/
│  ├─ ui/
│  └─ styles/
└─ tests/
```

## 1. Core types

```ts
type VehicleType = 'MC' | 'LV' | 'HV' | 'PU';

interface Vehicle {
  id: number;
  type: VehicleType;
  x: number;          // longitudinal position, m
  y: number;          // lateral position, m, measured from left edge
  v: number;          // speed, m/s
  a: number;          // acceleration, m/s²
  vLat: number;       // lateral speed, m/s
  length: number;
  width: number;
  params: IdmParams;  // jittered per vehicle at spawn
  entryTime: number;
  stopped: boolean;
}

interface IdmParams {
  v0: number;   // desired speed, m/s
  T: number;    // safe time headway, s
  s0: number;   // minimum gap, m
  a: number;    // max acceleration, m/s²
  b: number;    // comfortable deceleration, m/s²
  delta: number;
}

interface World {
  t: number;
  step: number;
  vehicles: Vehicle[];
  geometry: Geometry;
  signal: SignalState | null;
  detectors: Detector[];
  rng: Rng;
  warnings: SimWarning[];
}

function step(world: World, dt: number, params: Params): World;
```

`step` is pure in behaviour: same world plus same params plus same RNG state produces the
same next world. Mutation in place for performance is fine as long as that property holds.

## 2. IDM

```
s* = s0 + max(0, v·T + v·Δv / (2·√(a·b)))
a  = a·[ 1 − (v/v0)^δ − (s*/s)² ]
```

where `s` is the bumper-to-bumper gap to the leader and `Δv` is the approach rate.

Guards:
- Clamp `s` to a small positive minimum before dividing. A zero gap produces infinite
  deceleration and a NaN cascade that is hard to trace back.
- Clamp resulting acceleration to `[-8, a_max]` m/s². Emergency braking harder than about
  8 m/s² is not physical and indicates a parameter problem.
- If `v` would go negative, set it to zero. Vehicles do not reverse.

Ring topology needs modular distance. Keep a single `gapTo(leader, follower, geometry)`
that handles both open and ring cases so the ring scenario cannot silently use open-road
distance.

## 3. Neighbour finding

The hot path. A naive O(n²) scan is fine at 400 vehicles but not at the densities the
bottleneck scenario reaches.

Use a uniform grid indexed by longitudinal position, cell size roughly the interaction
range (about 100 m). For each vehicle, query its cell and neighbours, then filter by lateral
overlap.

**Lateral overlap test:** vehicle B is a candidate leader for A if their lateral footprints
overlap by more than a threshold fraction, and B is ahead of A. The threshold is a model
parameter, not a constant — a motorcycle half-overlapping a car's lane still constrains it,
partially. Expose it.

For the sublane and social rules the constraint is graded rather than binary: the effective
gap is weighted by overlap fraction. Document the weighting function in the code and surface
it in the interface, since it materially affects filtering behaviour.

## 4. Lateral rules

All three implement one interface:

```ts
interface LateralRule {
  name: string;
  citation: string | null;      // null for social force — say so
  lateralAcceleration(v: Vehicle, world: World, params: Params): number;
  candidateLeaders(v: Vehicle, world: World): Vehicle[];
}
```

**Strict lanes** — discretise `y` to lane centres, use MOBIL for changes. Lateral position
snaps; there is no continuous drift.

**Gap-seeking sublane** — sample lateral offsets within reach, score each by the
longitudinal gap it would afford, move toward the best, rate-limited by a maximum lateral
speed (roughly 1 m/s for MC, 0.3 m/s for LV). Add a centring preference toward the current
position to prevent oscillation — without it, vehicles chatter between two equally good
offsets and it looks broken.

**Social force** — repulsive potential from each neighbour and from road edges, summed.
Tune so motorcycles pack into gaps without overlapping. This rule has no traffic-literature
citation and its `citation` field must be `null`, which the UI renders as a stated caveat
rather than an empty field.

## 5. Detectors and the estimator boundary

This is the app's integrity mechanism. Take it seriously.

```ts
// src/estimators/detector-record.ts — the ONLY shared type
interface DetectorRecord {
  detectorId: string;
  crossingTime: number;
  vehicleClass: VehicleType;   // what an observer classifies by eye
  spotSpeed: number;           // as a loop or radar would measure
  occupancyTime: number;       // time the detector was covered
  lateralPosition: number;     // observable
}
```

`src/sim/detectors.ts` produces these. `src/estimators/*` consume these and nothing else.

The ESLint rule:

```js
{
  files: ['src/estimators/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: ['**/sim/**', '../sim/*', '@/sim/*']
    }]
  }
}
```

If an estimator needs something it cannot get from a `DetectorRecord`, that is the finding,
not an obstacle to route around. Real field engineers had the same problem.

`src/truth/substitution.ts` is the exception and may import `sim/`, because ground truth is
explicitly the thing an observer cannot obtain.

## 6. Estimators

Each returns a value plus the diagnostics needed to judge it:

```ts
interface EmpEstimate {
  method: string;
  value: number;
  r2: number | null;           // where a regression is involved
  sampleCount: number;
  interval: number;            // aggregation seconds
  warnings: string[];          // e.g. "negative estimate — model inapplicable"
}
```

A negative estimate is **reported, not clamped**. The −0.11 in the literature is the app's
single most persuasive data point and hiding it would defeat the purpose. Flag it with a
warning and plot it below the axis.

The aggregation interval is passed in, not fixed. Sweeping it is a first-class user action.

## 7. Rendering

**Canvas** for the road, time–space diagram and speed heatmap. The road can hold 400
vehicles at 60 fps; the time–space diagram accumulates thousands of trajectory points and
must not be a growing SVG DOM.

Time–space diagram technique: draw incrementally to an offscreen canvas, one column of
pixels per simulated interval, scrolling when full. Never redraw history — history does not
change. This is what makes it cheap and it is also what makes it feel like a chart recorder,
which is the right feeling.

**SVG** for the fundamental diagram, equivalence bench, discharge plot and lateral
cross-section. These have few elements, need labels and focus, and are the views most likely
to be read carefully.

Do not attach listeners to vehicles. One listener on the road canvas, hit-tested against a
spatial query.

## 8. Simulation loop

```
accumulator += frameDelta * speedMultiplier
while (accumulator >= DT) {
  step(world, DT, params)
  accumulator -= DT
}
render(world, accumulator / DT)   // interpolation factor for smooth drawing
```

Cap the while loop at a maximum number of steps per frame (say 20) so a background tab
returning to focus does not lock the thread trying to catch up. When capped, drop the excess
and note it — do not silently run slow.

Render interpolation matters at high speed multipliers. Positions drawn at
`x + v * dt * alpha` look smooth; positions drawn at the raw step look juddery even at
60 fps.

## 9. Batch sweeps

Worker-based. The worker imports `sim/` and `estimators/` and runs headless with no
rendering. Post progress every N points; support cancellation.

Because the engine is deterministic and seeded, a sweep is reproducible from its seed and
parameter set alone. Store both with the result so a bench chart can be regenerated.

## 10. State and URL

```ts
interface AppState {
  scenario: ScenarioId;
  params: Params;             // all simulation parameters
  lateralRule: 'lanes' | 'sublane' | 'social';
  seed: number;
  speed: number;              // 0.25× to 16×
  running: boolean;
  selectedVehicle: number | null;
  aggregationInterval: 180 | 300 | 900 | 3600;
}
```

Everything except `running` and `selectedVehicle` serialises to the URL. A surprising result
must be shareable as a link that reproduces it exactly. This is a PRD commitment (§7.3), not
a convenience.

## 11. Copy

English, sentence case, no exclamation marks.

Units on every number: `m/s`, `veh/h`, `veh/km`, `s`. Speeds displayed in km/h in the
interface and held in m/s internally; convert at the boundary only.

Parameter sources cited inline the way pasal citations work in Suara ke Kursi — an inline
marker opening a dismissible popover naming MKJI, the IDM paper, or the dimension source.
The social force rule's popover states plainly that it has no traffic-literature basis.

Warnings are specific: `Negative equivalence at 60-minute aggregation — the regression is
not applicable at this interval`, not `invalid result`.

## 12. Build order

Do not start the UI before step 5 passes.

1. RNG, types, geometry, IDM. Equilibrium test against the closed form.
2. Neighbour index, ring topology, open corridor.
3. Sugiyama ring scenario. **Gate — must reproduce spontaneous jam formation.**
4. Detectors and the estimator boundary, with the lint rule active.
5. Estimators and the substitution ground truth. **Gate.**
6. Design tokens, shell, road canvas at 60 fps with the ring scenario.
7. Time–space diagram sharing the road's position axis. This pairing is the app's core
   moment; get it right before anything else.
8. Lateral rules: sublane, then social. Lanes/MOBIL last, since it is the comparison
   baseline rather than the subject.
9. Speed heatmap, fundamental diagram.
10. Signal, RHK, discharge plot.
11. Side friction, angkot scenario.
12. Equivalence bench, batch worker, sweep UI.
13. Vehicle inspector.
14. Lateral occupancy, CSV export.
15. Reduced motion, keyboard, mobile, Lighthouse.

## 13. Deployment

GitHub Pages via Actions. `base` set to the repo path. CI: typecheck → lint (including the
import restriction) → test → build. Deploy only on green.
