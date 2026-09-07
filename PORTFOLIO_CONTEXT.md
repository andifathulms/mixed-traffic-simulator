# Portfolio context — Mixed Traffic Simulator

Raw material for a client-facing case study. Everything below is checked against the
codebase, `package.json`, and `git log` rather than the specification documents alone.

---

## 1. One-line summary

An interactive browser simulator of Indonesian motorcycle-dominated traffic that
demonstrates, with a controlled experiment no field study can run, that the standard
"one motorcycle equals 0.25 cars" conversion factor used in Indonesian road planning is
an artefact of how it was measured.

---

## 2. The problem

Indonesian road capacity analysis runs on MKJI 1997, which converts every vehicle into
passenger car units using a fixed equivalence factor (*emp*). Motorcycles are assigned
0.25 or 0.5 depending on road type. Two decades of Indonesian field studies have measured
that "constant" at 0.198, 0.32, 0.35, 0.4, 0.84 — and, in one Denpasar regression study,
**−0.11 at one-hour aggregation**, which is physically meaningless.

The consequence is operational, not academic. The specification cites Bundaran Tirosa,
where the same roundabout in the same peak hour rates **level of service C** by
occupancy-time equivalence and **level of service F** by MKJI. Acceptable, or failed,
depending on which method someone chose. That difference funds or does not fund an
intervention.

A field study cannot settle this, because you cannot re-run the same hour of traffic with
the motorcycles removed. A simulator can. The app:

1. simulates a stream with a known motorcycle share,
2. obtains **ground truth** by controlled substitution — re-runs the identical scenario
   with motorcycles replaced by cars and compares capacity,
3. applies each published estimation method to the *same* stream, using only what a
   roadside observer could have seen,
4. shows the methods disagreeing with each other and with the truth already in hand.

**Audience:** Indonesian transport engineers and planners, traffic-engineering students,
and technically literate policy readers. Secondarily, anyone who wants to see emergent
congestion explained by a working model rather than an animation.

---

## 3. My role

Sole author. 38 commits, all by one author, from an empty repository to a deployed app —
specification, simulation engine, estimators, visual design system, eight instruments,
tests and CI.

**Built from scratch (no library used):**

- The physics engine — Intelligent Driver Model, three lateral-movement rules, spatial
  neighbour index, signal controller, side-friction events, demand generation.
- The seeded PRNG (`src/sim/rng.ts`); `Math.random` is banned repo-wide by a lint rule.
- Every chart and visualisation. No charting library: the canvas views draw pixel by
  pixel, the SVG views compute their own axes and tick placement
  (`src/views/render/axis.ts`).
- The design system — tokens, control primitives, layout, typography, the brand mark and
  the icon set.
- All five equivalence estimators and the ground-truth substitution experiment.

**Inherited / used as-is:** React 18 + Vite + TypeScript as the shell, Vitest and
Testing Library for tests, ESLint, and the Overpass typeface via Fontsource. That is the
entire dependency list.

---

## 4. Technical approach

**The estimator firewall — the load-bearing decision.** The whole argument collapses if
the estimation methods can cheat. So `src/estimators/` is structurally forbidden from
importing `src/sim/`: an ESLint `no-restricted-imports` rule ([eslint.config.js:25](eslint.config.js#L25))
fails the build if it tries, and that lint step runs in CI before deploy. The estimators
consume exactly one shared type, `DetectorRecord` — a crossing time, a vehicle class
judged by eye, a spot speed, an occupancy time, a lateral position. Nothing else. A
method that can see true speeds and true vehicle identities is not the method a field
engineer used, and comparing it to one would be dishonest. `src/truth/substitution.ts`
is the single documented exception, because ground truth is by definition the thing an
observer cannot obtain.

**Determinism as a product feature.** Fixed 0.05 s physics timestep, decoupled from the
render loop and accumulated per frame, so results never depend on the user's hardware. A
single seeded generator is threaded through the entire simulation. Because of that, the
full application state — scenario, every parameter, lateral rule, seed, speed,
aggregation interval — serialises to the URL. A surprising result is shareable as a link
that reproduces it exactly, and a batch sweep is regenerable from its seed alone.

**Naming the modelling choice instead of hiding it.** There is no canonical model for
lane-free traffic. Rather than pick one and imply it is physics, the app ships three
selectable lateral rules — strict lanes with MOBIL, gap-seeking sublane, and social-force
potentials — and names the active one in the interface at all times. The social-force
rule has no traffic-literature citation, so its `citation` field is literally `null` and
the UI renders that as a stated caveat rather than an empty field.

**Negative results are reported, not clamped.** When an estimator returns a physically
meaningless negative equivalence, it is plotted below the axis with a specific warning.
That number is the app's most persuasive data point; hiding it would defeat the purpose.

**Rendering split by what each view needs.** Canvas for the road, the time–space diagram
and the speed heatmap — the time–space diagram draws one pixel column per simulated
interval to an offscreen canvas and never redraws history, which is both cheap and makes
it feel like a chart recorder. SVG for the fundamental diagram, equivalence bench,
discharge plot and cross-section, which have few elements and need labels and focus.

**Main thread for interaction, worker for sweeps.** At 400 vehicles the interactive
simulation is well inside frame budget, and a worker would add latency to every control.
Only the batch parameter sweeps go to a Web Worker.

---

## 5. Actual tech stack

Verified against `package.json`. Four runtime dependencies, two of which are fonts.

| | |
| --- | --- |
| Runtime deps | `react` 18.3, `react-dom` 18.3, `@fontsource/overpass`, `@fontsource/overpass-mono` |
| Language | TypeScript 5.7, strict, project references |
| Build | Vite 6, ES2022 target |
| Styling | Plain CSS with custom properties — no Tailwind, no CSS-in-JS |
| Testing | Vitest 2.1, Testing Library, jsdom |
| Lint | ESLint 9 flat config + typescript-eslint, with two custom restriction rules |
| Concurrency | Web Worker (batch sweeps only) |
| Deploy | GitHub Actions → GitHub Pages |

**Not used, deliberately:** no physics library, no charting library, no simulation
framework, no state-management library, no UI kit. Zero network requests at runtime.

---

## 6. Notable features

- **Phantom Jam** — reproduces Sugiyama et al. (2008): 22 vehicles on a 230 m ring at
  constant speed with no bottleneck and no incident. A jam forms from reaction dynamics
  alone and propagates backward forever; the app measures its wave speed at −8.6 km/h.
  This is a build gate and a regression test, not a demo.
- **The equivalence bench** — five methods (ground-truth substitution, time headway,
  multiple regression, speed regression, occupancy time) plotted against motorcycle share
  with MKJI's constant drawn as a flat reference line. Ground truth is nearly flat; the
  regression and speed methods swing from +16 to −30 and cross zero repeatedly.
- **Aggregation interval as a first-class control** — 3, 5, 15 and 60 minutes. Watching
  an estimate invert as the window widens is the single thing the app exists to show, and
  it reproduces the published −0.11.
- **The paired road and record** — the top-down road view and the time–space diagram
  share one horizontal position axis pixel for pixel, with a ruler between them saying
  so. A jam in the road sits directly above its backward-leaning stripe in the record.
- **Three switchable lateral rules**, named in the interface at all times, so the user can
  see how much of the answer depends on the modelling choice.
- **Ruang Henti Khusus toggle** — the advance motorcycle stop box used at Indonesian
  junctions, with a discharge plot measuring saturation flow and headway with and
  without it, to answer whether formalising the swarm actually helps.
- **Vehicle inspector** — select any vehicle and watch its IDM arithmetic live: free-flow
  term, interaction term, current gap, desired gap, resulting acceleration. The
  "show your work" view for anyone who does not believe the simulation.
- **Cancellable batch sweeps** in a worker, plus CSV export of trajectory data.

---

## 7. Challenges and tradeoffs

**Collisions were the recurring fight.** Overlapping vehicles are treated as bugs, not
cosmetic glitches, and three separate commits exist purely to kill them: *"Add the
remaining scenarios and fix two collision bugs"*, *"Make bodies solid at contact and
resolve lateral clearance iteratively"*, and *"Fix five collision bugs found by testing
every scenario"*. The lateral rules were the cause — continuous lateral movement plus
longitudinal car-following can push two bodies into the same space in a way strict lanes
never can. The resolution was iterative lateral clearance at contact plus a non-overlap
assertion every step. **Two rare cases still remain and are documented in the README
rather than papered over**: vehicles squeezed below their own width in a signal queue,
and the sublane rule occasionally leaving a car 0.7 m inside a stopped angkot. Both
surface as specific numerical warnings instead of being drawn.

**A mid-project design rebuild.** After the instruments were functionally complete, six
consecutive commits tore up and rebuilt the visual foundation — *"Rework the design
foundation: layered grounds, control primitives"*, *"Rebuild the shell: live readings, a
stated axis, a parameter grid"*, *"Give the seven instruments one set of furniture"*,
*"Put the canvas colours in one place"* — followed by rewriting DESIGN.md to match what
had actually been built. The trigger was that seven instruments built independently had
each grown their own furniture and did not read as one machine.

**A colour discipline that had to be enforced.** Speed is luminance and vehicle type is
shape, never hue; hue is reserved entirely for the five estimators, the one thing that
genuinely needs categorical colour. Two later commits are corrections where instruments
had drifted and borrowed the estimator palette to separate vehicle types.

**Honest visual compromises, stated in the UI.** A road is two orders of magnitude longer
than it is wide, so the road view stretches its across-road axis. That stretch is capped
and printed in the corner of the view rather than applied silently.

**Build order enforced by gates.** No UI work started until the engine, detectors,
estimators and ground truth passed — the commit history shows exactly that, with
*"Reproduce the Sugiyama ring — build gate 3 passes"* and *"gate 5 passes"* preceding
the first line of interface code.

**Later fixes reveal what only shows up in use:** a scenario picker that did not actually
load the scenario it named, warnings firing once per measurement instead of once per
event, an entry gate admitting vehicles into a blocked roadside, bench labels printing
over each other, and em-dashes stripped out of all interface copy for consistency.

---

## 8. Status

- **Live and deployed:** https://andifathulms.github.io/mixed-traffic-simulator/
- **Public repository:** https://github.com/andifathulms/mixed-traffic-simulator
- **CI/CD:** GitHub Actions — typecheck → lint (including the estimator import
  restriction) → test → build → deploy. Deploys only on green, only from `main`.
- **Maturity:** a finished, shipped explainer with a working engine and a full test
  suite — not a prototype. It is explicitly *not* a calibrated model of any specific road
  or intersection, and the app states this rather than implying otherwise. It is not a
  replacement for SUMO or Vissim.

---

## 9. Metrics

| | |
| --- | --- |
| Commits | 38, single author |
| Time span | 2 September – 3 September 2026 (two days, concentrated) |
| Source | ~11,700 lines across `src/` (TS/TSX/CSS) |
| Tests | ~1,700 lines, 129 test cases across 11 suites |
| Engine | 2,635 lines in `src/sim/` — pure, headless, zero imports |
| Estimators | 759 lines, structurally firewalled from the engine |
| Views | 3,561 lines across 8 instruments; 2,703 lines of shell and controls |
| Runtime dependencies | 4 (React, React DOM, two font packages) |
| Bundle | 241 KB JS + 32 KB CSS raw; **~78 KB + 7 KB gzipped** — comfortably under the 300 KB budget |
| Scenarios | 6 presets (phantom jam, corridor, bottleneck, signalised, angkot, bench) |
| Vehicle classes | 4 (MC, LV, HV, PU) |
| Estimation methods | 5, plus ground truth |
| Network requests at runtime | 0 |

---

## 10. Suggested screenshots

Two are already captured in `docs/media/` and used in the README.

1. **The paired road and time–space record — the app's core moment.** The ring road above
   the record, showing a jam as a dark cluster with its backward-leaning stripe directly
   below, and the measured wave speed annotated. Already captured as
   `docs/media/phantom-jam.png`.
   Components: [Road.tsx](src/views/Road/Road.tsx), [draw.ts](src/views/Road/draw.ts),
   [TimeSpace.tsx](src/views/TimeSpace/TimeSpace.tsx),
   [recorder.ts](src/views/TimeSpace/recorder.ts), [Ruler.tsx](src/ui/Ruler.tsx)

2. **The equivalence bench — the thesis in one image.** Five methods sweeping across
   motorcycle share, ground truth nearly flat in black, the regression and speed methods
   swinging to −30 with negative results ringed in red, and MKJI's constant as a dashed
   rule. Already captured as `docs/media/equivalence-bench.png`.
   Component: [EquivalenceBench.tsx](src/views/EquivalenceBench/EquivalenceBench.tsx)

3. **The vehicle inspector — "show your work".** One selected vehicle with its live IDM
   terms broken out: free-flow term, interaction term, current gap, desired gap, resulting
   acceleration. Best captured with the vehicle mid-braking so the interaction term
   dominates.
   Component: [Inspector.tsx](src/views/Inspector/Inspector.tsx)

4. **The full shell with the parameter grid and instrument bay.** Shows the app as an
   instrument rather than a toy: the active lateral rule named, live telemetry readings,
   inline citation markers, the transport controls and the tabbed instrument bay.
   Components: [App.tsx](src/ui/App.tsx),
   [Parameters.tsx](src/ui/Parameters.tsx),
   [InstrumentBay.tsx](src/ui/InstrumentBay.tsx),
   [Telemetry.tsx](src/ui/Telemetry.tsx),
   [TransportBar.tsx](src/ui/TransportBar.tsx)

5. *(Optional fifth)* **The signal scenario with RHK on, plus the discharge plot.** The
   most recognisably Indonesian view — the advance motorcycle stop box filling with
   motorcycles, with headway against queue position beside it.
   Components: [DischargePlot.tsx](src/views/DischargePlot/DischargePlot.tsx),
   [Road.tsx](src/views/Road/Road.tsx)
