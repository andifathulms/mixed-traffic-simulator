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

### 2.1 Two grounds, each a scale

The first version gave each ground a single value. That was the mistake the 2.0 rework
fixed: with one flat value per ground, nothing could be raised above it, so every control
looked painted on rather than pressable and a popover had no surface to float over. Each
ground is now a scale.

**The dark ground** — the road, and everything that commands it.

| Token | Value | Use |
|---|---|---|
| `--void` | `#0A0C0D` | The page behind everything, and the inside of a slider track. |
| `--asphalt-edge` | `#101314` | Beyond the road edge; the ground the stage sits on. |
| `--asphalt` | `#171A1C` | The road surface. Cool near-black. |
| `--surface` | `#1B1F21` | A plate raised off the ground: the telemetry cluster. |
| `--surface-raised` | `#232A2C` | A control at rest. |
| `--surface-hover` | `#2C3437` | A control under the pointer. |
| `--surface-active` | `#353E41` | A control being pressed. |
| `--border-dark` | `#2C3335` | Hairlines, control borders. |
| `--border-dark-strong` | `#414B4D` | The same, hovered, and ruler ticks. |
| `--on-dark` | `#E8ECE9` | Text and marks on the dark ground. |
| `--on-dark-mid` | `#A2ACAC` | Labels. |
| `--on-dark-faint` | `#7E8888` | Ticks, units, keyboard hints. Clears 4.5:1 on all four dark grounds; the tightest is `--surface` at 4.56. |
| `--marking` | `#8E9A9C` | Lane markings, stop lines, RHK box outline. Never pure white — thermoplastic is grey in real light. |

**The paper ground** — the record, and everything that reads it.

| Token | Value | Use |
|---|---|---|
| `--paper-raised` | `#F7F8F4` | A plate lifted off the panel: a parameter card, a popover. |
| `--paper` | `#EEEFEB` | Instrument panel grounds. |
| `--paper-sunken` | `#E4E6E0` | Recessed areas: tab strips, slider tracks, figure blocks. |
| `--rule` | `#D5D8D1` | Hairlines on paper. |
| `--rule-strong` | `#BCC0B8` | Chart axes, which must out-weigh a gridline. |
| `--ink` | `#171A1A` | Text and marks on paper. |
| `--ink-mid` | `#54595A` | Labels, axis text. |
| `--ink-faint` | `#626867` | Ticks, disabled, secondary text. Clears 4.5:1 on both paper grounds; the tightest is `--paper-sunken` at 4.52. |
| `--type-mc` | `#171A1A` | Vehicle type on paper: motorcycle, the strongest value because it is the subject. |
| `--type-lv` | `#5F6664` | Light vehicle. |
| `--type-hv` | `#99A09C` | Heavy vehicle. |
| `--type-pu` | `#C3C8C4` | Public transport, the lightest, which also carries a hatch where it sits on a large area. |
| `--ink-line` | `#8A908F` | **Not text.** Dashed reference lines and the inspector's term bar. This is the old `--ink-faint`: when that token was raised to meet AA as text, the lines that had borrowed it would have become heavy, so the line role kept the original value. Contrast minimums do not apply; `tests/tokens.test.ts` fails the build if anything paints `color` or `fill` with it. |

Every colour in these two tables that carries text meets WCAG AA against every ground it
is used on. That is asserted in `tests/tokens.test.ts` rather than left to inspection: the
faint tokens were previously below AA on every ground, and because six components read
their text colour from those two tokens, the failure was invisible six times over and
fixable once.

Dark road, light instruments, in one view. Do not unify them — the contrast between the
lit road and the paper record is the app's structure, and flattening it into a single dark
theme would lose it.

### 2.2 The speed ramp

The app's primary encoding. From the asphalt's own value to full brightness.

| Speed | Colour | Reading |
|---|---|---|
| 0 | `#202426` | barely above the road; a stopped vehicle is nearly a hole |
| 25% of free | `#3F4649` | present but dim |
| 50% | `#6D7678` | mid |
| 75% | `#A3ACAD` | bright |
| 100%+ | `#E6EBE9` | full, near the marking value |

Achromatic by design. It is colourblind-safe without effort, it survives being drawn at
3 px, and it leaves hue free for §2.4.

The ramp is normalised to the scenario's free-flow speed and the normalisation is stated,
because a 30 km/h scenario and a 60 km/h scenario would otherwise look identical.

**Do not use a red–yellow–green traffic-light ramp.** It is the single most predictable
choice available here, it fails for a tenth of male users, and it spends the hue channel on
something luminance already carries.

Canvas cannot read a custom property, so these values exist twice: in `tokens.css` and in
`views/render/palette.ts`. That duplication is unavoidable, so it is confined to one file
per side and each entry names its counterpart. It had already drifted once — the heatmap
and the time–space recorder were painting two different papers on adjacent plates.

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
| Ground truth (substitution) | `#171A1A` — ink, because it is not one method among five |
| Time headway | `#BD5A31` |
| Regression | `#2C6D7D` |
| Speed | `#79539B` |
| Occupancy time | `#527F3C` |
| MKJI 1997 constant | `#9AA0A0` — drawn as a flat dashed rule, not a series |

Ground truth is black and the MKJI constant is grey, so the two reference lines read as
different in kind from the four estimates. That distinction is the chart's argument, and it
is carried in weight as well as value: ground truth is drawn at 3 px against the estimates'
2 px.

**Nothing else in the app may use these six colours to mean anything else.** The lateral
cross-section used to: it stacked motorcycles in the headway orange and light vehicles in
the regression teal, so a reader who had learned those colours on the bench met them two
tabs away meaning vehicle type. Type is shape on the road (§2.3) and value in the
cross-section (§5.5). It is never hue.

### 2.5 Functional colours

| Token | Value | Use |
|---|---|---|
| `--signal-red` | `#C0392B` | Signal aspect only |
| `--signal-amber` | `#D89A2B` | Signal aspect only |
| `--signal-green` | `#3E8E5A` | Signal aspect, and the running indicator |
| `--warn` | `#CF5136` | Numerical warnings, negative estimates, collision alerts |
| `--warn-tint` | `#F7E7E2` | The ground a warning sits on |
| `--select` | `#E6EBE9` | Selected vehicle ring |

The signal colours are the one place a traffic-light palette is correct, because it is a
traffic light. They appear nowhere else — not on vehicles, not on charts. The single
exception is the running dot in the masthead, which is green because it means *going*, in
the same sense the signal does.

### 2.6 Interaction is achromatic

Hue in this app means "estimator method" or "signal aspect" and nothing else. A hover state
that borrowed a hue would be making a category error, so controls signal their state
through value and border weight instead: a control lifts through `--surface-raised` →
`hover` → `active`, and its border strengthens with it. Focus is a 2 px ring in the
ground's own foreground — near-white on the road, near-black on paper.

The one exception is `--btn--primary`, which inverts: the ground's foreground becomes its
background. There is at most one of these per control group, and it is the thing the eye
should land on first.

### 2.7 Radius and elevation

Panels stay square. They are full-bleed plates butted against one another and a rounded
plate would float away from its neighbour, breaking the join the shared axis depends on.

Controls get 4 px, cards and popovers 6 px, pills and slider thumbs a full round. That
radius is what separates a pressable thing from a painted rectangle, and its absence was
the single biggest reason the first version's controls read as inert.

One nested tier below that: an item sitting inside a 4 px control gets 3 px. The segmented
control's items and the keycap hints are the only things in the app that qualify. A nested
radius has to be the outer radius minus the inset or the two curves fight, and the inset
here is 1 px. Four tiers is the whole scale: 3, 4, 6, round. A fifth would be an accident
rather than a decision.

Three elevation steps and no more: `--shadow-1` for a thing that is merely lifted (a
slider thumb, an active segment), `--shadow-2` for a plate, `--shadow-pop` for something
that has left the plane entirely — a citation popover. The dark ground gets its own
`--shadow-pop-dark`, because a shadow tuned for paper is invisible on asphalt.

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

Base 16 px, ratio ~1.25, tracking tightened as size rises and opened only at label size.

`--t-readout` and `--t-nano` were added when eight component files were found
setting bare pixel sizes — 15, 17, 10 and 10.5 — outside the scale entirely.
Declaring them did not add sizes to the app; it admitted to sizes the app was
already using. The one real change was the chart ticks, which were 10.5 px and
are now 10 like every other tick.

Body is 16 px, which is the floor for prose a visitor has to read in order to understand
the app: the descriptor, the scenario blurb, empty-state captions. The smaller steps below
it are for labelling data — axis ticks, units, vehicle IDs — and stay where they are.
Setting an axis tick at 16 px would break every chart in the app in order to satisfy a
rule that was written about paragraphs.

| Token | Size / line-height / tracking | Face | Use |
|---|---|---|---|
| `--t-display` | 34 / 1.05 / −0.02em, 600 | Overpass Mono | The headline figure: emp value, capacity |
| `--t-figure` | 26 / 1.05 / −0.015em, 600 | Overpass Mono | Live readouts, panel values |
| `--t-h2` | 17 / 1.25 / −0.008em, 600 | Overpass | Panel and instrument headings |
| `--t-body` | 16 / 1.55, 400 | Overpass | Explanatory copy. Max 68 characters. |
| `--t-data` | 13 / 1.45, 400 | Overpass Mono | Tables, parameter values, axis numbers |
| `--t-small` | 12.5 / 1.4, 400 | Overpass | Subtitles, hints, legend |
| `--t-label` | 11.5 / 1.3 / +0.04em, 500 | Overpass | Field and axis labels |
| `--t-micro` | 11 / 1.25, 400 | Overpass Mono | Vehicle IDs at high zoom, tick labels, units |
| `--t-readout` | 15 / 1.2, 500 | Overpass Mono | The masthead's live figures, between data and a heading |
| `--t-nano` | 10 / 1.3, 400 | Overpass Mono | The smallest label: ruler and chart ticks, keycap hints, canvas pills |

`font-variant-numeric: tabular-nums` on all Overpass Mono. Non-negotiable — a readout
updating twenty times a second with proportional figures is unreadable.

The gap between `--t-figure` at 26 px and `--t-small` at 12.5 px is doing the hierarchy.
An instrument's answer should be findable without reading a word of it; its working should
be there when the reader goes looking.

### 3.2 The label style, and the prohibitions

A field label is set at `--t-label`: 11.5 px, weight 500, in the mid ink, with 0.04em of
tracking. **Sentence case, never caps.** The tracking is there because a label at 11.5 px
sitting immediately above the value it names needs to be separable from it at a glance, and
value and weight alone were not enough to do that.

This is the one place tracking is opened up, and it is an amendment to the original
prohibition rather than a repeal of it: the ban was on all-caps tracked-out eyebrows, which
shout. A sentence-case label with a little air does not.

Still prohibited: all-caps labels. Coloured words in headings — hue means estimator method
here and nothing else. Any third typeface.

---

## 4. Layout

### 4.0 The masthead

```
┌───────────────────────────────────────────────────────────────────────┐
│ ▤ Mixed traffic simulator      Scenario [ Phantom jam ▾ ] ·source·     │
│   Motorcycle-dominated traffic…    ┌──────────────────────────────┐   │
│                                    │ ● 2:14 │ Vehicles │ Mean… │  │   │
│                                    └──────────────────────────────┘   │
├───────────────────────────────────────────────────────────────────────┤
│ A ring of traffic with no obstruction…  │ Not calibrated to any…      │
└───────────────────────────────────────────────────────────────────────┘
```

Three things in one band: what this is, which scenario is loaded, and what the simulation is
doing right now.

The last of those was missing entirely from the first version. The app animated a phenomenon
at length without ever stating the clock, the fleet size or the mean speed in words — a
reader could watch a jam form and still not be able to say how fast anything was going. The
telemetry plate carries clock, vehicles, mean speed, density and motorcycle share, refreshed
four times a second: fast enough to feel live, slow enough to be *read*, which a 60 Hz number
is not.

Whether the simulation is running is stated by a mark that is itself doing something — a slow
two-second pulse on the clock dot. The alternative is watching the clock to see whether it
advances, which takes a second and a half. It pulses rather than blinks, because §6.6 rules
out anything that competes with the road for attention.

The scenario's own sentence and the non-calibration fact (PRD §7.4) sit below the band on a
quieter strip, where they can be read once and then ignored rather than competing with the
controls for the same eye.

### 4.1 The shared axis

```
┌───────────────────────────────────────────────────────────────────┐
│ Road · corridor, unrolled · speed is luminance                    │
│ ░░░░░░░░░░░░░░░░░░░░░░░░ THE ROAD ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  dark
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ ░░░░░░░ ▪▪  ▫ ▪ ░░░░░░ ▪▪▪▪▫▪▪ ░░░░░░░░░░░░ ▪ ▫  ▪ ░░░░░░░░░░░░░░ │
│ │0      │200     │400     │600     │800        position, m       │  ruler
│ Record · time–space, same position axis · time runs downward      │
│  t ↓  ╲╲╲╲╲     ╲╲╲╲╲╲╲╲        ╲╲╲╲                              │  paper
│       ╲╲╲╲╲╲      ╲╲╲╲╲╲╲╲        ╲╲╲╲                            │
│         ╲╲╲╲╲╲      ╲╲╲╲╲╲╲╲        ╲╲╲╲                          │
├──────────────────────────────┬────────────────────────────────────┤
│ FUNDAMENTAL DIAGRAM          │ INSTRUMENT BAY                     │
│  q ↑    ▁▂▄▆█▆▄▂             │ [bench|heatmap|lateral|discharge|  │
│         ░░░░░░░░             │  inspector]                        │
│         k →                  │                                    │
├──────────────────────────────┴────────────────────────────────────┤
│ PARAMETERS  ▸ geometry · signal · demand · lateral · friction     │
├───────────────────────────────────────────────────────────────────┤
│ ▶Play Step Reset  1× ░ MC 60% ░░░░  seed 4471  sublane ▾ ·source· │
└───────────────────────────────────────────────────────────────────┘
```

The road and the time–space diagram are locked to one horizontal position axis. A jam
visible as a dark patch in the road sits directly above the backward-leaning stripe that is
the same jam in the record.

Everything else in the layout is negotiable. This is not.

**The ruler states it.** The alignment was true in the first version and invisible: two
canvases butted together, and the reader had to take the correspondence on trust. A 20 px
ruler now sits between them carrying round tick positions in metres. It is laid out by
percentage from the same two numbers the canvases use, which is the identical linear map
`positionToPixel` applies — one calculation, so there is nothing to drift. On the ring
scenario its label says the position is around a loop, because there 0 m and L m are the
same place.

Each canvas also carries a tag naming what it is and what its axes mean. "Speed is
luminance" is the app's central encoding and it was nowhere on screen.

Nothing in this column may take horizontal padding, a border, or a scrollbar that its
neighbours do not.

### 4.2 The road view

Full width, roughly 220 px tall for a corridor. Metres per pixel adjustable; default fits
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

Tabs sit on `--paper-sunken` and the active one is lifted onto `--paper` with a 2 px rule
that scales in from the centre. The strip is a recessed groove and the selected tab is the
plate at the front of it — the same physical idea the segmented control uses, at a larger
size.

### 4.4 The transport bar

Pinned to the bottom, full width, dark to match the road rather than the instruments —
it controls the simulation, not the record. It carries a shadow upward, so it reads as
sitting above the page rather than being the end of it.

Four groups, in the order they are reached for:

1. **Run it.** Play as the one primary button on the bar, with a glyph, so the eye finds it
   without reading. Step and reset beside it, and the keyboard shortcuts — `space`, `.`,
   `r` — stated as key caps rather than left to be discovered.
2. **Set its rate.** The speed multiplier as a segmented control, not a dropdown: seven
   fixed steps where seeing the whole range at once tells the reader what the range *is*.
3. **The variable.** The motorcycle fraction takes every pixel the other three groups do
   not, with a filled track and a 15 px readout. It is the app's principal independent
   variable and a two-centimetre slider for it would have been a lie about what matters.
4. **Declare the model.** Seed and lateral rule.

**The active lateral rule is named here at all times** (PRD §7.1), with its citation marker
beside it. The social force rule's marker reads "no citation" before it is even opened, and
its popover states plainly that it has no traffic-literature basis.

### 4.5 Grid and rhythm

8 px base, with a 4 px half step for control interiors. Spacing scale: 4 · 8 · 16 · 24 · 40
· 64. Full-bleed width for the road and time–space diagram.

Panels are separated by value and hairline; plates within a panel get 6 px of radius and a
border. Prose is capped at 68 characters — `--measure`, so it is set in one place.

### 4.6 Mobile

Below 860 px the road and time–space diagram stay stacked and keep their shared axis — they
are the app and they do not collapse. Both shrink in height; the road to 120 px, the record
to 200 px. The fundamental diagram moves into the instrument bay as another tab. The
scenario picker and the telemetry plate each take a full row, the motorcycle fraction moves
to the top of the transport bar where it gets the whole width, and the parameter grid
becomes one column.

Below 1100 px the telemetry drops density and motorcycle share, keeping clock, vehicles and
mean speed. Below 560 px the key caps and the canvas tag notes go, because at that width
they are the difference between a bar that fits and one that wraps twice.

### 4.7 The parameters panel

It used to be one column, twenty-two controls tall, which meant the only way to reach the
gradient was to scroll past the signal.

It is now a grid of grouped plates — geometry, signal, demand, lateral model, side friction,
dimensions, export — reflowing at a 21 rem minimum, so the number of columns follows the
window and nothing is pinned to a position. The signal card exists only where there is a
signal, and the grid closes around its absence.

The header states how many settings differ from the scenario's own and offers one button to
put them back. Without it, a reader who has moved six sliders has no way to get back to a
known state short of reloading, and the scenario's meaning quietly decays as they explore.

The whole panel collapses. The instruments are the point of the app; the knobs are how you
interrogate them, and a reader who is done adjusting should be able to put them away.

Every field is one shape — label, current value with units, control, and where the value
needs defending, a sentence saying why it exists. That shape lives in `ui/Field.tsx`. Before,
each of the twenty-odd sliders spelled it out by hand, which is how they drifted apart.

---

---

## 5. Instruments

### 5.0 Shared instrument chrome

Seven instruments were each inventing their own header, padding, tick size and idea of how
big a subtitle is. A reader moving between two of them was relearning the furniture before
reading the data.

One shape, in `views/instrument.css`: a title; a subtitle that says what is plotted against
what, in words ("flow against density", "equivalence against motorcycle share"); an optional
control row separated by a rule; the plot; a note. Each view's own stylesheet keeps only
what is genuinely its own — the IDM equilibrium curve, the RHK dashed saturation line, the
zero rule the bench plots below.

Plot furniture is three weights and no more: the frame at `--rule-strong`, the gridline at
`--rule`, the annotation in `--ink-faint`. Gridlines are drawn before the data, so every
mark that means something sits over the furniture rather than through it. Anything heavier
than this competes with what it is meant to be supporting.

A headline figure is set at `--t-figure` over a `--t-label` caption. The figure is the
answer and the rest is the working, and that relationship should survive being glanced at.

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

Four stacked types need four separable marks, and they get four *values* — never the
estimator hues (§2.4). Motorcycles take the strongest value because they are the subject;
public transport, the lightest and the one nearest the plot ground, carries a hatch as
well, so the chart survives being printed in one colour.

### 5.6 Equivalence bench

Motorcycle fraction on the horizontal axis, emp on the vertical. Five series plus the MKJI
constant as a flat dashed rule.

**The axis extends below zero**, because a negative estimate is a real result and clamping
it would hide the app's best finding. Points below zero carry a warning marker.

**The axis is robust, and nothing is dropped.** Two estimates at minus twenty-nine flattened
every other series into a hairline at zero, so a chart whose entire argument is "these four
methods disagree, and by how much" showed four coincident lines and two spikes. The window
is the fifth to ninety-fifth percentile of the finite estimates, always widened to contain
zero, one and the MKJI constant — the three numbers a reader compares against. An estimate
outside that window is drawn at the edge it left through, as a triangle pointing that way,
with its exact value printed beside it and counted in a note below. Reported, at the edge,
never hidden and never clamped in the data.

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
| Control hover, press, focus | 120 ms | `cubic-bezier(.4,0,.2,1)` |
| Running indicator pulse | 2 s, looping | `cubic-bezier(.4,0,.2,1)` |

Controls transition at 120 ms — long enough to read as a response, short enough that a
reader adjusting a slider never waits for the interface to catch up with them. The one
exception is the slider thumb, which scales on hover but whose *value* changes with no
easing at all: §6.1 requires a continuous control to map to the simulation on the frame it
changes.

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
