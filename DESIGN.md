# DESIGN.md — Mixed Traffic Simulator

Visual and motion specification. PRD.md defines substance; this defines form.

This is the most animation-heavy app in the family. Almost everything on screen is moving
almost all the time, which inverts the usual problem: the discipline here is not finding
moments worth animating, it is stopping the motion from becoming noise.

---

## 0. The design problem

Two constraints pull against each other.

**Everything moves.** Four hundred vehicles, a scrolling trajectory recorder, an
accumulating scatter, live counters. A design that decorates any of that becomes unreadable
within seconds.

**Two variables must be readable simultaneously on every vehicle** — what type it is, and
how fast it is going. Type is the composition question the whole app is about. Speed is
where the congestion is. Both, at once, on objects a few pixels wide, in motion.

The resolution is to split them onto orthogonal channels and use no hue at all for either:

- **Type is shape.** A motorcycle is a small narrow mark; a car is a rectangle; a bus is a
  long one; an angkot is a rectangle with a notch. Silhouette at 4 px is enough because the
  dimensions are genuinely different, and that difference is the app's subject.
- **Speed is luminance.** A stopped vehicle sits at the asphalt's own value and nearly
  vanishes into the road. A vehicle at free speed is bright. Nothing between them is
  coloured.

The consequence is the app's central image: **jams appear as voids.** A queue is a dark
patch where the road has swallowed its traffic. You find congestion by looking for absence,
which is exactly how it feels from the air.

This deliberately inverts Compression Lab's mapping, where cost was rendered as ink on a
page. Here speed is rendered as light on asphalt. Related instinct, opposite polarity,
different ground — the inversion is intentional and should be preserved.

Hue is then entirely free, and is spent on the one thing that genuinely needs categorical
colour: the five equivalence estimators.

---

## 1. Design plan

**Concept: the chart recorder.**

A pen plotter running beside a road at night. The road is dark and lit; the instruments are
paper-pale and drawn in ink. Two registers, side by side, because that is literally what the
app is — a live phenomenon and a continuous record of it.

The time–space diagram is the hinge between them. It is the one instrument that is both: it
draws itself continuously like a recorder while showing the same road the animation shows,
on the same axis.

**Alignment:** the road view and the time–space diagram share one horizontal position axis,
pixel for pixel. A jam at position x in the animation sits directly above its stripe at
position x in the record. This alignment is the single most important layout decision in the
app and nothing may break it — not a legend, not a margin, not a responsive breakpoint.

---

## 2. Colour

### 2.1 Two grounds

| Token | Value | Use |
|---|---|---|
| `--asphalt` | `#191C1E` | The road surface. Cool near-black. |
| `--asphalt-edge` | `#0F1112` | Beyond the road edge; the void the road sits on. |
| `--marking` | `#8E9A9C` | Lane markings, stop lines, RHK box outline. Never pure white — thermoplastic is grey in real light. |
| `--paper` | `#E9EAE6` | Instrument panel grounds. |
| `--paper-edge` | `#DDDFDA` | Recessed areas within panels. |
| `--ink` | `#1B1E1F` | Text and marks on paper. |
| `--ink-mid` | `#5B6162` | Labels, axis text. |
| `--ink-faint` | `#9AA0A0` | Ticks, disabled. |
| `--rule` | `#C9CCC7` | Hairlines on paper. |

Dark road, light instruments, in one view. Do not unify them — the contrast between the
lit road and the paper record is the app's structure, and flattening it into a single dark
theme would lose it.

### 2.2 The speed ramp

The app's primary encoding. From the asphalt's own value to full brightness.

| Speed | Colour | Reading |
|---|---|---|
| 0 | `#232729` | barely above the road; a stopped vehicle is nearly a hole |
| 25% of free | `#41484A` | present but dim |
| 50% | `#6E7779` | mid |
| 75% | `#A3ACAD` | bright |
| 100%+ | `#E4E9E7` | full, near the marking value |

Achromatic by design. It is colourblind-safe without effort, it survives being drawn at
3 px, and it leaves hue free for §2.4.

The ramp is normalised to the scenario's free-flow speed and the normalisation is stated,
because a 30 km/h scenario and a 60 km/h scenario would otherwise look identical.

**Do not use a red–yellow–green traffic-light ramp.** It is the single most predictable
choice available here, it fails for a tenth of male users, and it spends the hue channel on
something luminance already carries.

### 2.3 Type as shape

| Type | Mark |
|---|---|
| MC | narrow rounded bar, 0.7 × 1.9 m to scale |
| LV | rectangle, 1.7 × 4.4 m |
| HV | long rectangle with a 1 px division line at the cab |
| PU | rectangle with a notch cut from the kerbside edge |

Drawn to true scale at the road view's metres-per-pixel. At default zoom a motorcycle is
about 3 × 8 px and a bus about 10 × 50 px, which is enough. When zoomed out past legibility,
MC marks get a minimum size so composition stays readable, and the interface says the marks
are no longer to scale.

Heading is drawn — vehicles rotate slightly with lateral velocity. This is a small detail
that does an enormous amount of work: a filtering motorcycle angling into a gap reads as
intent rather than as sliding.

### 2.4 The estimator palette

The only hue in the app, spent where categorical distinction is genuinely needed.

| Method | Colour |
|---|---|
| Ground truth (substitution) | `#1B1E1F` — ink, because it is not one method among five |
| Time headway | `#B4562A` |
| Regression | `#2F6E7C` |
| Speed | `#7A5296` |
| Occupancy time | `#4B7A3E` |
| MKJI 1997 constant | `#9AA0A0` — drawn as a flat dashed rule, not a series |

Ground truth is black and the MKJI constant is grey, so the two reference lines read as
different in kind from the four estimates. That distinction is the chart's argument.

### 2.5 Functional colours

| Token | Value | Use |
|---|---|---|
| `--signal-red` | `#C0392B` | Signal aspect only |
| `--signal-amber` | `#D89A2B` | Signal aspect only |
| `--signal-green` | `#3E8E5A` | Signal aspect only |
| `--warn` | `#D8543C` | Numerical warnings, negative estimates, collision alerts |
| `--select` | `#E4E9E7` | Selected vehicle ring |

The signal colours are the one place a traffic-light palette is correct, because it is a
traffic light. They appear nowhere else — not on vehicles, not on charts.

---

## 3. Typography

**Overpass** and **Overpass Mono**. One superfamily.

Overpass descends from the Highway Gothic lineage used on road signage. That is not a
decorative allusion — the app is about road engineering, its readers are people who read
traffic signs and traffic engineering documents, and the face carries that register without
costume. It also holds up at small sizes on a dark ground, which the road view needs.

Overpass Mono handles every number, every table, every live readout. The app is full of
counters that update at 60 fps and they must not jitter.

No third family. The app has almost no running prose and does not need another voice.

### 3.1 Scale

Base 15 px. Ratio 1.25.

| Token | Size / line-height | Face | Use |
|---|---|---|---|
| `--t-display` | 36 / 1.05, 600 | Overpass Mono | The headline figure: emp value, capacity |
| `--t-figure` | 23 / 1.1, 600 | Overpass Mono | Live readouts, panel values |
| `--t-h2` | 18 / 1.25, 600 | Overpass | Panel headings |
| `--t-body` | 15 / 1.55, 400 | Overpass | Explanatory copy. Max 66 characters. |
| `--t-data` | 13 / 1.45, 400 | Overpass Mono | Tables, parameter values, axis numbers |
| `--t-small` | 12 / 1.35, 400 | Overpass | Labels, legend |
| `--t-micro` | 10 / 1.2, 500 | Overpass Mono | Vehicle IDs at high zoom, tick labels |

`font-variant-numeric: tabular-nums` on all Overpass Mono. Non-negotiable — a readout
updating twenty times a second with proportional figures is unreadable.

### 3.2 Prohibitions

No all-caps labels. No tracked-out eyebrows. No coloured words in headings — hue means
estimator method here and nothing else. Sentence case throughout.

---

## 4. Layout

### 4.1 The shared axis

```
┌───────────────────────────────────────────────────────────────────┐
│ Mixed Traffic Simulator          scenario: Phantom Jam            │
├───────────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░ THE ROAD ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  dark
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ ░░░░░░░ ▪▪  ▫ ▪ ░░░░░░ ▪▪▪▪▫▪▪ ░░░░░░░░░░░░ ▪ ▫  ▪ ░░░░░░░░░░░░░░ │
├───────────────────────────────────────────────────────────────────┤
│ TIME–SPACE  (same position axis, pixel for pixel)                 │  paper
│  t ↓  ╲╲╲╲╲     ╲╲╲╲╲╲╲╲        ╲╲╲╲                              │
│       ╲╲╲╲╲╲      ╲╲╲╲╲╲╲╲        ╲╲╲╲                            │
│         ╲╲╲╲╲╲      ╲╲╲╲╲╲╲╲        ╲╲╲╲                          │
│           position →                                              │
├──────────────────────────────┬────────────────────────────────────┤
│ FUNDAMENTAL DIAGRAM          │ INSTRUMENT BAY                     │
│  q ↑    ▁▂▄▆█▆▄▂            │ [bench|heatmap|lateral|discharge|  │
│         ░░░░░░░░             │  inspector]                        │
│         k →                  │                                    │
├──────────────────────────────┴────────────────────────────────────┤
│ ▶ ‖ ⏭  1×   seed 4471   ░ MC 60% ░░░░  width 7m   sublane ▾       │
└───────────────────────────────────────────────────────────────────┘
```

The road and the time–space diagram are locked to one horizontal position axis. Zooming or
panning one moves the other. A jam visible as a dark patch in the road sits directly above
the backward-leaning stripe that is the same jam in the record.

Everything else in the layout is negotiable. This is not.

### 4.2 The road view

Full width, roughly 180 px tall for a corridor. Metres per pixel adjustable; default fits
the scenario length.

For the ring scenario the road is drawn as a ring rather than unrolled, because the ring is
the point — the jam travelling backward forever around a closed loop is the demonstration.
The time–space diagram unrolls it, and having both simultaneously is precisely the
pedagogy.

Road edges are hard lines against `--asphalt-edge`. Markings, where enabled, are dashed in
`--marking`. When markings are off, the absence should be visible — a bare surface with no
lane structure, which is what much of the road network actually looks like.

### 4.3 The instrument bay

Tabbed: equivalence bench, speed heatmap, lateral occupancy, discharge plot, vehicle
inspector. One at a time, on paper ground.

The fundamental diagram sits outside the bay, permanently visible beside it, because it
accumulates continuously and hiding it behind a tab would lose the accumulation.

### 4.4 The transport bar

Pinned to the bottom, full width, dark to match the road rather than the instruments —
it controls the simulation, not the record.

Left: play, pause, step, reset, and a speed multiplier from 0.25× to 16×.
Centre: the motorcycle fraction slider, given the most width, because it is the app's
principal independent variable.
Right: seed, lateral rule selector, and the scenario chooser.

**The active lateral rule is named here at all times** (PRD §7.1), with its citation marker
beside it. The social force rule's marker opens a popover stating it has no
traffic-literature basis.

### 4.5 Grid and rhythm

8 px base. Spacing scale: 8 · 16 · 24 · 40 · 64. Full-bleed width for the road and
time–space diagram; 84 rem max for everything else.

Panels are separated by value and hairline. No radius, no shadow.

### 4.6 Mobile

Below 860 px the road and time–space diagram stay stacked and keep their shared axis — they
are the app and they do not collapse. Both shrink in height; the road to 120 px, the record
to 200 px. The fundamental diagram moves into the instrument bay as another tab. The
transport bar keeps play/pause, speed, and the motorcycle fraction; everything else moves
behind a parameters sheet.

---

## 5. Instruments

### 5.1 The road

Vehicles drawn to scale, shape by type, luminance by speed, rotated by lateral velocity.

Selecting a vehicle draws a `--select` ring and opens the inspector. The selected vehicle
keeps its ring while it exists and the view can optionally follow it, which for a motorcycle
in dense traffic is the best way to understand filtering.

Detector positions are marked as thin cross-road lines in `--marking` at 40% opacity.
The signal, when present, is drawn as a stop line with the aspect shown as a small bar
beside the road — not as a floating traffic-light icon.

The RHK box, when enabled, is outlined on the surface in `--marking` with a hatch, exactly
as it is painted on real roads.

### 5.2 Time–space diagram

Position on x, time on y, increasing downward. One line per vehicle, drawn in the speed
ramp so the line's brightness varies along its own length.

Free-flowing traffic makes near-parallel bright diagonals. A jam makes a dark band that
leans backward against the flow, and the slope of that band is the backward wave speed —
readable directly off the chart with a measuring tool the app provides.

Drawn incrementally: one column per simulated interval, appended to an offscreen canvas,
scrolling when full. History never redraws, which is both a performance property and the
right feeling — it is a chart recorder, and the paper only moves one way.

### 5.3 Speed heatmap

Position × time, same axes as the time–space diagram, but aggregated into cells coloured by
mean speed rather than drawn per vehicle. The macroscopic companion to the microscopic
record.

Useful when vehicle count makes the trajectory plot too dense to read. Switchable in place
so the user can compare the same period both ways.

### 5.4 Fundamental diagram

Flow against density, accumulating live from detector data. Points fade in as they arrive
and older points recede toward `--ink-faint`, so the current state is distinguishable from
the accumulated cloud.

The free-flow branch, the capacity peak and the congested branch appear over a few minutes
of simulation. Watching the cloud grow into that shape, rather than being shown the shape,
is the point.

Overlay: the analytic IDM equilibrium curve, for comparison against what the simulation
actually produced. Where they diverge, that divergence is information.

### 5.5 Lateral occupancy

A cross-section of the road: width on the horizontal axis, showing where vehicles actually
sit laterally, as a density distribution by type.

Under strict lanes this shows discrete spikes at lane centres. Under sublane it shows a
continuous distribution with motorcycles filling the edges and the interstices. Switching
the lateral rule and watching the distribution change from spikes to a smear is the
clearest possible statement of what the rule choice does.

### 5.6 Equivalence bench

Motorcycle fraction on the horizontal axis, emp on the vertical. Five series plus the MKJI
constant as a flat dashed rule.

**The axis extends below zero**, because a negative estimate is a real result and clamping
it would hide the app's best finding. Points below zero carry a warning marker.

The aggregation interval control sits directly on the chart. Changing it re-derives every
estimate from the same detector record — no re-simulation — and the series visibly move
while ground truth and the MKJI line stay put. That contrast is the whole argument, and it
happens in under a second.

### 5.7 Discharge plot

Headway against queue position at the stop line, for the signal scenario. Points for each
discharging vehicle across many cycles, coloured by type.

The saturation headway appears as the level the series flattens to after the first few
positions. With RHK on, the motorcycle points cluster at the front and the flattening
happens sooner. Show both conditions overlaid.

### 5.8 Vehicle inspector

The "show your work" view. For the selected vehicle, live:

- current speed, desired speed, gap, desired gap
- the IDM free-flow term and the interaction term as two signed bars that sum to the
  resulting acceleration
- the leader's identity and type
- lateral: current offset, lateral speed, the offsets being considered and their scores

The two-bar acceleration decomposition is the important part. Watching the interaction term
grow and overwhelm the free-flow term as a gap closes is car-following made visible, and it
is the app's counterpart to the division trace in Anatomi QRIS.

---

## 6. Motion

### 6.1 The rule

Carried forward and now settled across four apps:

**Continuous control → direct mapping, zero easing.** Motorcycle fraction, width, inflow,
speed multiplier, and the aggregation interval all take effect on the frame they change.

**Discrete control → timed transition.** Scenario switch, lateral rule switch, RHK toggle,
instrument tab.

### 6.2 The simulation is not an animation

Vehicle motion is not eased, timed or curved. It is the physics, rendered. Nothing about it
is a design decision except the interpolation factor that smooths sub-timestep positions
(CLAUDE.md §8).

Everything in this section applies to the interface *around* the simulation.

### 6.3 Durations

| Event | Duration | Curve |
|---|---|---|
| Scenario switch | 400 ms — road fades, rebuilds, record clears | `cubic-bezier(.32,.72,0,1)` |
| Lateral rule switch | 600 ms — vehicles ease from old to new lateral positions | `cubic-bezier(.32,.72,0,1)` |
| Instrument tab | 240 ms | `cubic-bezier(.4,0,.2,1)` |
| Bench re-derive on interval change | 350 ms, series interpolating | `cubic-bezier(.32,.72,0,1)` |
| Vehicle select ring | 160 ms | `cubic-bezier(.4,0,.2,1)` |
| Fundamental diagram point arrival | 200 ms fade in | linear |
| Warning appearance | 200 ms | `cubic-bezier(.4,0,.2,1)` |

The lateral rule switch is deliberately slow. Vehicles migrating from lane centres to a
continuous distribution over 600 ms is a small piece of teaching and it should be watchable.

### 6.4 First orchestrated moment: the jam drawing itself

The ring scenario at start. Twenty-two vehicles, evenly spaced, all at the same speed.
Nothing is wrong. The road is a bright even necklace.

Over roughly a minute of simulated time, one small perturbation amplifies. On the road, a
dark patch condenses. Simultaneously, in the record directly below, a backward-leaning
stripe begins drawing itself downward — and the two are the same event, on the same
position axis, one as it happens and one as history.

**This dual reading is the app's best moment and the reason the shared axis is
non-negotiable.** The user should not have to be told they are looking at the same thing.

Requirements: the ring scenario autoplays on load at 4× so the jam appears within about
fifteen seconds of wall clock. The record must be visible from the first frame, not revealed
after. No caption, no arrow, no highlight — if the alignment is right, the connection is
self-evident.

### 6.5 Second orchestrated moment: percolation at red

The signal scenario. A queue forms at a red light. Cars stop in a block. Motorcycles keep
arriving and thread forward through the gaps — laterally, continuously, individually — and
accumulate into a swarm at the stop line.

Then green: the swarm launches, discharging far faster than the car block behind it, and the
discharge plot registers the difference in real time.

Requirements: the percolation must be legible at default zoom, which is why heading rotation
(§2.3) matters. A motorcycle angling between two cars reads as filtering. A motorcycle
sliding sideways reads as a bug.

With RHK enabled, the same sequence plays with the swarm forming inside the painted box, and
the difference in discharge is the measurement.

### 6.6 Restraint

No entrance animations on panels. No hover transitions on charts. No pulsing controls. No
particle effects, no motion blur, no camera shake, no speed lines. The road is already the
most kinetic thing on any screen this family of apps has produced; adding to it would be
vandalism.

### 6.7 Reduced motion

`prefers-reduced-motion: reduce`:

- The simulation does not autoplay. It opens paused at t = 0 with a visible play control.
- The road advances only on explicit step or play.
- The time–space diagram and heatmap render complete for the elapsed period rather than
  drawing progressively.
- All interface transitions become instant state writes.

Every number and every chart remains reachable. The user loses the animation, not the app.

---

## 7. Copy

English, sentence case, no exclamation marks.

Units on everything. Speeds in km/h in the interface. Flow in veh/h, density in veh/km,
headway in seconds.

Parameter sources cited inline with a marker that opens a dismissible popover. The lateral
rule selector carries its citation permanently, and the social force option's popover states
that it has no traffic-literature basis and is included for comparison.

The non-calibration statement (PRD §7.4) sits with the scenario chooser, once, as a fact:
`Simulated with cited default parameters. Not calibrated to any specific location.`

Warnings name what happened and what it implies: `Negative equivalence at 60-minute
aggregation — the regression is not applicable at this interval.` Never `invalid`.

---

## 8. Quality floor

Assumed, not announced: usable at 380 px with the road and record both legible; visible
keyboard focus everywhere including vehicle selection; every instrument has a
keyboard-reachable table equivalent; trajectory and detector data exportable as CSV;
contrast 4.5:1 for text and 3:1 for graphical objects — noting that the low end of the speed
ramp is deliberately below that, which is legitimate because it is redundant encoding and
every value is available in the inspector and the table view; reduced motion honoured; no
network at runtime.

## 9. Relationship to the house layer

Takes: the spacing scale, the motion curve family, the citation-popover pattern, the type
floor, the continuous-versus-discrete motion rule.

Contributes back two patterns worth promoting:

**The shared axis.** Two views of the same phenomenon, one live and one accumulated, locked
to a common coordinate so the correspondence needs no explanation. This generalises to any
app with a live process and a record of it.

**Simulation is not animation.** Where a view renders a physical process, the process is
authored by the model and not by the designer. Motion design applies to the interface around
it and stops at its edge. Worth stating in the house layer so it is not relearned.

Departs in one place: this is the only app in the family with two grounds in one view — dark
road and paper instruments, side by side. The reason is in §1: the app is a phenomenon and a
record of it, and collapsing them into one theme would erase the distinction the layout is
built on.
