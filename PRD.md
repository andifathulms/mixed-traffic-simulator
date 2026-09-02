# Mixed Traffic Simulator — Product Requirements

**Name:** Mixed Traffic Simulator
**Descriptor:** Motorcycle-dominated traffic, and why the numbers that describe it disagree
**Type:** Static single-page application. No backend, no network at runtime.
**Deploy target:** GitHub Pages.
**Interface language:** English.

> **On the name.** "Traffic Simulator" alone is the one option that says nothing — there
> are thousands, and it is unsearchable. "Mixed traffic" is the actual term of art in the
> literature for motorcycle-dominated non-lane-based flow, and it makes the app a direct
> sibling of Raft Simulator.
>
> **Phantom Jam** stays. It is the name of the opening scene (§5.1) — the ring road where a
> jam appears out of nothing. That is where the phrase is accurate, and it is the first
> thing anyone sees. The word survives; it just names the scene rather than the app.

---

## 1. The thesis

Indonesian traffic engineering converts every vehicle to passenger car units using
equivalence factors (emp) from MKJI 1997 — a fixed constant per vehicle type. Motorcycles
get 0.25 or 0.5 depending on road type.

Two decades of Indonesian field studies have found that constant is not constant. Published
measurements of motorcycle emp include 0.198 on an intercity four-lane road, 0.32 at a
roundabout by occupancy time, 0.35–0.36 on Solo–Sragen, 0.4 or higher argued for in
Semarang, and 0.84 on a rural road by time headway.

One Denpasar study using regression obtained 0.11 at three-minute aggregation, 0.10 at
fifteen minutes, and **−0.11 at one hour.** A negative passenger car equivalent is
physically meaningless. The estimator broke, and it broke because of a choice about how
long an interval to count over.

The consequence is not academic. At Bundaran Tirosa, the same roundabout in the same peak
hour rated **level of service C** by occupancy-time equivalence and **level of service F**
by MKJI. Acceptable, or failed, depending on the method. That difference funds or does not
fund an intervention.

**The app's thesis: the equivalence factor everyone quotes is an artefact of the method
that measured it.**

## 2. Why a simulator can settle what a field study cannot

In the field you can never know the true equivalence, because you cannot re-run the same
hour of traffic with the motorcycles removed.

In simulation you can. That gives this app a structure no field study has:

1. Simulate a stream with a known motorcycle fraction.
2. Obtain **ground truth** equivalence by controlled substitution: re-run the identical
   scenario with motorcycles replaced by cars and compare capacity directly.
3. Apply each published estimation method to the *same* simulated stream, using only what a
   roadside observer could have seen.
4. Show the methods disagreeing — with each other, and with the truth already in hand.

**Integrity requirement, load-bearing:** the estimators consume virtual detector output
only. They never read the simulation's internal state. A method that gets to see true
speeds and true vehicle identities is not the method a field engineer used, and comparing
it to one would be dishonest. See §7.2.

## 3. What the app is not

- Not a calibrated model of any specific Indonesian road or intersection. It is a simulator
  with cited default parameters. It must never claim to reproduce a real location.
- Not a network simulator. One corridor, one intersection. No routing, no OD matrices, no
  second junction.
- Not a policy recommendation. It shows what the arithmetic produces under stated
  assumptions.
- Not a replacement for SUMO or Vissim. It is an explainer with a working engine.

## 4. Scope — full feature set

### 4.1 Vehicle types

Following MKJI classification, plus one addition:

| Type | Length | Width | Notes |
|---|---|---|---|
| MC — motorcycle | 1.9 m | 0.7 m | Filters laterally; narrow footprint is the entire point |
| LV — light vehicle | 4.4 m | 1.7 m | The reference unit |
| HV — heavy vehicle | 12.0 m | 2.5 m | Bus or truck; slower acceleration, longer gaps |
| PU — public transport | 4.8 m | 1.9 m | Angkot; stops at the roadside on demand (§4.5) |

Dimensions are defaults and are user-editable. Cite the source for each.

### 4.2 Longitudinal model

Intelligent Driver Model (Treiber, Hennecke & Helbing, 2000). Five parameters per vehicle
type: desired speed v₀, safe time headway T, minimum gap s₀, maximum acceleration a,
comfortable deceleration b, plus the acceleration exponent δ.

Chosen because it is continuous, has a closed-form equilibrium (which gives the app an
exact test, §6.1), and produces realistic stop-and-go waves from reaction dynamics alone.

Per-vehicle parameter jitter, drawn from a seeded distribution, so drivers are not
identical. Heterogeneity is what makes jams form.

### 4.3 Lateral model — the honest part

Lane-based car-following assumes lane discipline. Indonesian traffic does not have it, and
there is **no canonical lane-free model**. This is a modelling choice, and the app treats
it as one.

Implement a sublane approach: continuous lateral position, type-specific widths,
longitudinal acceleration computed against the nearest obstacle within a lateral corridor,
plus a lateral movement rule.

Ship **three** selectable lateral rules so the user can see how much the answer depends on
the choice:

1. **Strict lanes** — discrete lanes with MOBIL lane changing. The baseline that is wrong
   for Indonesia and right for comparison.
2. **Gap-seeking sublane** — vehicles drift laterally toward the corridor offering the
   largest usable gap, rate-limited by a maximum lateral speed.
3. **Social force** — repulsive potentials from neighbours and road edges, adapted from
   pedestrian dynamics. Best at reproducing motorcycle swarming; least grounded in traffic
   literature.

The active rule is named in the interface at all times, alongside a statement that the
lateral rule is a choice rather than physics. This is this app's counterpart to the model
cost in Compression Lab and the counterfactual disclaimer in Suara ke Kursi.

### 4.4 Signalised intersection

Fixed-time controller: cycle length, green, amber, all-red, per approach. Multiple phases.

**Ruang Henti Khusus (RHK)** as a toggle — the advance motorcycle stop box used at
Indonesian intersections. With RHK, motorcycles have a stop line ahead of other vehicles.
Without it, they percolate to the front anyway and stop wherever they arrive.

The measurable question: does formalising the swarm improve discharge, and at what
motorcycle fraction does it stop helping? The app answers by measuring saturation flow and
discharge headway with and without, across a fraction sweep.

### 4.5 Side friction

MKJI treats side friction (*hambatan samping*) as a capacity reduction factor. Simulate the
events themselves rather than applying a factor:

- Roadside parked vehicles narrowing the usable width.
- Angkot stopping to pick up passengers, blocking a corridor for a sampled dwell time.
- Pedestrians crossing.
- Vehicles entering and exiting from roadside premises.

Each is a scheduled obstacle with a rate control. Watching a single stopping angkot seed a
wave that propagates back a kilometre is one of the app's best demonstrations, and it is
the mechanism the MKJI factor abstracts away.

### 4.6 Geometry

- Road width, continuous, not lane count. Lanes are a marking, and marking is optional.
- Optional lane markings, on or off, since their presence changes behaviour under the
  strict-lane rule and not under the other two.
- Bottleneck: a width reduction at a position, with configurable severity.
- Gradient, affecting HV acceleration.

### 4.7 Demand

- Inflow rate in vehicles per hour, per type, giving the composition.
- Motorcycle fraction as a first-class slider from 0 to 90%, since it is the app's principal
  independent variable.
- Arrival process: Poisson by default, with a toggle for uniform and for platooned arrivals.

### 4.8 The equivalence bench

The app's centrepiece. Given a scenario, compute motorcycle emp five ways:

1. **Ground truth by substitution** — controlled re-run with motorcycles replaced by cars
   at equal person-throughput, comparing capacity. Only a simulator can do this.
2. **Time headway method** — from mean headways by leader–follower type pair.
3. **Multiple linear regression** — regress flow on counts by vehicle type.
4. **Speed method** — regress space-mean speed on composition.
5. **Occupancy time** — from mean detector occupancy by type.

**The aggregation interval is a user control**: 3, 5, 15, and 60 minutes. This is not a
detail. It is the control that produced a negative emp in the published literature, and
watching an estimate invert as the user widens the window is the single most persuasive
thing this app does.

Output: all five values plotted together against motorcycle fraction, with MKJI's constant
drawn as a flat line across the whole range.

### 4.9 Batch sweep

Run the scenario across a swept parameter — motorcycle fraction, road width, inflow, or
signal timing — headless and at speed, collecting results into the bench and the
fundamental diagram. Progress shown; cancellable.

This is what turns a toy into an instrument, and it is only possible because the engine is
deterministic (§7.3).

## 5. Scenarios

Preset, each with a stated source where one exists.

### 5.1 Phantom Jam — the opening scene

Sugiyama's circular track: 22 vehicles on a 230 m single-lane ring, no bottleneck, no
incident, identical instructions. A jam appears from reaction dynamics alone within a
couple of minutes and then propagates backward forever.

This is the first thing a user sees, it is a published experiment with known parameters, and
it doubles as a validation test (§6.2). Everything the app is about — that congestion is
emergent rather than caused — is present in the first thirty seconds.

Then: add motorcycles to the same ring and watch what filtering does to the wave.

### 5.2 Corridor

Open road, inflow at one end, free exit at the other. The workhorse scenario. Motorcycle
fraction, width, and side friction all live.

### 5.3 Bottleneck

Width reduction mid-corridor. Produces the capacity drop and a standing queue upstream — the
classic demonstration that outflow from a jam is lower than the capacity that caused it.

### 5.4 Signalised intersection

One approach, fixed-time signal, RHK toggle. Measures saturation flow and discharge
headway.

### 5.5 Angkot

Corridor with public-transport stopping events. Demonstrates side friction as a mechanism
rather than a coefficient.

### 5.6 Equivalence bench

Batch mode. Not an animated scene — a sweep and a chart. Reachable directly, because some
users will come only for this.

## 6. Correctness

The simulation must be checkable or the numbers mean nothing.

### 6.1 Analytic equilibrium

IDM has a closed-form equilibrium spacing for a given speed. In steady state on a ring at
low density, simulated spacing must match the analytic value to within floating-point
tolerance. Exact test, no judgement.

### 6.2 Sugiyama reproduction

The ring scenario at published parameters must produce spontaneous jam formation within the
published time range, with a backward wave speed in the observed range. Regression test.

### 6.3 Fundamental diagram shape

Flow against density must show the free-flow branch with slope equal to free speed, a
capacity peak, and a congested branch with backward wave speed of roughly 15–20 km/h.
Assert the wave speed falls in that band.

### 6.4 Conservation

Vehicles are neither created nor destroyed except at inflow and outflow boundaries. Assert
count conservation every step.

### 6.5 No collisions

Overlapping vehicles are a bug, not a feature. Assert zero overlap at every step across the
full scenario suite. If a parameter combination produces overlap, the app surfaces it as a
numerical warning rather than rendering vehicles inside each other.

### 6.6 Determinism

Identical seed plus identical parameters produces a bit-identical trajectory log. Tested
across a hundred-step run.

## 7. Commitments

### 7.1 The lateral rule is a choice

Named in the interface at all times, with alternatives one click away. Any result that
changes materially between lateral rules must be presented with that sensitivity visible —
if the emp estimate moves by more than a stated tolerance across the three rules, the bench
shows the spread rather than a single number.

### 7.2 Estimators see only what an observer sees

Detector output only. Count, time headway, occupancy, spot speed, at fixed positions, at
the selected aggregation interval. No internal state.

This is what makes the comparison meaningful and it must be enforced structurally — the
estimator module cannot import the vehicle state types. See CLAUDE.md §5.

### 7.3 Every run is reproducible and linkable

Seeded PRNG throughout. Scenario, parameters and seed serialise to the URL. Anyone who is
shown a surprising result can reproduce it exactly.

### 7.4 No calibration claim

The app states its parameter sources and states that it is not calibrated to any real
location. Defaults cite MKJI, the IDM paper, and the vehicle dimension sources.

### 7.5 No verdict

The app does not declare a correct emp value, a correct estimation method, or a
recommendation about RHK. It shows what each method reports and what the controlled
experiment measured.

## 8. Instruments

Eight. Full visual and motion specification in DESIGN.md.

1. **The road** — top-down continuous 2D view, the animated centre.
2. **Time–space diagram** — trajectories, position on x and time on y, sharing the road's
   position axis. Jams appear as backward-leaning stripes.
3. **Speed heatmap** — position × time coloured by speed. The canonical congestion plot.
4. **Fundamental diagram** — flow against density, accumulating live from detectors.
5. **Lateral occupancy** — a cross-section showing how road width is actually used, by type.
6. **Equivalence bench** — five methods against motorcycle fraction, with MKJI's constant.
7. **Discharge plot** — headway against queue position at the stop line, for the signal
   scenario.
8. **Vehicle inspector** — select a vehicle, see its IDM terms live: free-flow term,
   interaction term, current gap, desired gap, resulting acceleration.

Instrument 8 is the app's "show your work" view and the counterpart to the division trace
in Anatomi QRIS. Someone who does not believe the simulation must be able to watch one
vehicle's arithmetic.

## 9. Acceptance criteria

1. All tests in §6 pass in CI and block deploy.
2. 400 vehicles simulate and render at 60 fps on a mid-range laptop, at real-time speed.
3. The physics runs at a fixed 0.05 s timestep decoupled from render, so simulation results
   do not depend on frame rate. Verified by asserting identical results at 30 and 120 fps.
4. Batch sweep of 20 parameter points completes in under 20 seconds.
5. The active lateral rule is visible at all times.
6. Estimator module has no import path to vehicle state. Enforced by a lint rule.
7. `prefers-reduced-motion` honoured: the road view becomes step-driven, trajectory plots
   render complete rather than drawing progressively.
8. Fully keyboard operable, including vehicle selection and the transport controls.
9. Every instrument has a keyboard-reachable table equivalent, and the trajectory data is
   exportable as CSV.
10. Zero runtime network requests.
11. Bundle under 300 KB gzipped.
12. Usable at 380 px, with the road and time–space diagram both legible.
