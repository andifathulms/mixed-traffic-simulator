# Mixed Traffic Simulator

Motorcycle-dominated traffic, and why the numbers that describe it disagree.

A static single-page application. No backend, no network requests at runtime.

## The thesis

Indonesian traffic engineering converts every vehicle to passenger car units
using equivalence factors from MKJI 1997 — a fixed constant per vehicle type.
Motorcycles get 0.25 or 0.5 depending on road type.

Two decades of field studies have found that constant is not constant.
Published measurements of motorcycle emp include 0.198, 0.32, 0.35, 0.4, 0.84 —
and, in one Denpasar study using regression, **−0.11 at one-hour aggregation**.
A negative passenger car equivalent is physically meaningless. The estimator
broke, and it broke because of a choice about how long an interval to count
over.

**The equivalence factor everyone quotes is an artefact of the method that
measured it.** This app shows that by simulating a stream, obtaining ground
truth by an experiment no field study can run, and applying each published
method to the same stream using only what a roadside observer could have seen.

## What makes the comparison honest

`src/estimators/` cannot import from `src/sim/`. A lint rule fails the build if
it tries. The estimators consume `DetectorRecord` — a crossing time, a class
judged by eye, a spot speed, an occupancy time, a lateral position — and
nothing else. A method that gets to see true speeds and true vehicle identities
is not the method a field engineer used, and comparing it to one would be
dishonest.

`src/truth/substitution.ts` is the documented exception. It may read the
simulation, because ground truth is explicitly the thing an observer cannot
obtain: the same hour of traffic re-run with the motorcycles replaced by cars.

## Running it

```
npm install
npm run dev        # development server
npm test           # engine, estimators, scenarios, interface
npm run lint       # includes the estimator import restriction
npm run typecheck
npm run build
```

## What is checked

- **Analytic equilibrium.** Simulated acceleration at the closed-form IDM
  equilibrium gap is zero to 1e-12. An exact test, no judgement.
- **Sugiyama reproduction.** Twenty-two vehicles on a 230 m ring form a jam
  from reaction dynamics alone within about a hundred seconds and propagate it
  backward thereafter.
- **Determinism.** The same seed produces a bit-identical trajectory.
- **Frame-rate independence.** Step N is identical however the frames were cut.
- **Conservation and non-overlap** across every scenario, every step.
- **The shared axis.** The road and the time-space diagram place a given
  position at the same fraction of their width, at any backing store size.

## Reading the interface

The road and the time–space record share one horizontal position axis, pixel
for pixel, with a ruler between them that states it. A jam visible as a dark
patch in the road sits directly above the backward-leaning stripe that is the
same jam in the record.

Speed is luminance and type is shape — never hue. Hue is spent on the one thing
that needs categorical colour: the five equivalence estimators. Where an
instrument has to separate vehicle types it uses value, not the estimator
palette.

A road is two orders of magnitude longer than it is wide, so the road view
stretches its across-road axis. That stretch is capped and stated in the corner
of the view rather than applied silently.

## Known limits

It is not calibrated to any location and does not claim to be. It is one
corridor and one intersection — no routing, no OD matrices. The lateral rule is
a modelling choice rather than physics, which is why three of them ship and the
active one is named in the interface at all times; the social force rule has no
traffic-literature basis and says so.

Extremely dense stopped traffic can still produce a shallow lateral overlap for
a step or two. The app surfaces this as a specific numerical warning rather than
rendering vehicles inside each other.

## Documents

`PRD.md` is what and why. `DESIGN.md` is how it looks. `CLAUDE.md` is how it is
built.
