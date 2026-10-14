# VirFly by heyziq05

A virtual fruit fly (*Drosophila melanogaster*) living in a small glass dish. You look after it like a pet, and it decides what to do using a simple model built from a real map of a fruit fly's brain.

*Lalat* is Malay for "fly".

## Running it

You need Node.js 18 or newer.

```bash
npm install
npm run dev        # then open http://localhost:5173
npm run build      # makes a finished version in dist/
npm run preview    # tests the finished version
```

The graphics are kept light (no heavy post-processing or glass effects) so it runs smoothly on ordinary laptops, tablets and phones.

It works on phones and tablets as well as computers. On tablets the toolbar sits under the dish view. On phones the dish view, toolbar and panels are stacked in one scrolling page. On touch screens, tap instead of click, drag with one finger to turn the camera, pinch to zoom, and keyboard hints are hidden.

## How to play

| What you want to do | How | What the fly experiences |
| --- | --- | --- |
| Give food or water | Press `1`–`6`, then click the dish floor. Hold Shift to place more than one | It smells the food, or feels the damp air near water |
| Clean the dish | Press `C`, then click droppings or mouldy fruit. `X` cleans the nearest | A cleaner dish makes it calmer |
| Air puff | `Q` | A startle. It may fly away. If it was eating, it learns to dislike that food |
| Shadow | `W` | Looks like something about to hit it, so it escapes |
| Moving stripes | `E` | It turns to follow the stripes, as real flies do |
| Touch | Click the fly | A brush touch. It gets used to you over time |
| Pick up the fly | Turn on **Hold fly** (`G`), then press on the fly, drag it and let go | It is lifted off the paper and kicks its legs. When you put it down it feels the landing and may walk or fly off. It gets used to being handled over time |
| Lights | `L` switches between day/night, always on and always off | Darkness makes it sleepy |
| Camera | `V` follows the fly or shows the whole dish. `T` shows its recent path | |

Looking after the fly earns care points. New foods unlock as your care level goes up.

## The side panel

- **Fly**: what it is doing and why, how hungry, thirsty, tired and happy it is, and which foods it has learned to like.
- **Brain**: a live map of its 15 brain areas. Click an area to read what it does, see real cell IDs from FlyWire, or **switch it off** and watch what changes.
- **Behaviour**: a timeline of what it did, how it spent its time, its path around the dish, a diary of events, and a download of its movement data.
- **About**: how the project works, what it cannot do, and references.

## How it works

```
the dish ─▶ what the fly senses ─▶ brain model (real wiring) ─▶ choose an action ─▶ move
    ▲                                                                                │
    └────────────── hunger, thirst, tiredness, food, droppings ◀────────────────────┘
```

1. **The brain map.** The FlyWire project traced all 139,255 nerve cells in one fly's brain and recorded about 5.3 million connections between them. `scripts/preprocess_flywire.py` sorts every cell into one of 15 brain areas (smell, vision, memory, sleep and so on) and counts the connections between areas. The result is `src/data/brain-model.json`.

2. **The brain model** (`src/sim/brainEngine.js`). Each area has an activity level from 0 to 1. Ten times a second, each area moves part of the way toward the input it is getting:

   ```
   a_i ← clamp to [0, 1] of ( a_i + k · ( u_i + g · Σ_j w_ji · a_j − a_i ) )
   ```

   - `a_i` is the activity of area *i*.
   - `u_i` is input from the world, such as a smell, darkness or hunger.
   - `w_ji` is how strongly area *j* connects to *i*, from the FlyWire counts. Connections using the calming chemical GABA count as negative.
   - `k = 0.4` sets how fast areas react. `g = 0.5` sets how strongly areas pass activity to each other.

   This is a standard "leaky" firing-rate model from computational neuroscience (Dayan & Abbott, *Theoretical Neuroscience*, 2001, ch. 7). It came from the first version of this project. Only the connection strengths come from real data. `k`, `g` and the clamp were chosen by hand so the fly behaves sensibly.

3. **Senses** (`src/sim/sensing.js`). Food smell gets weaker with distance. Overripe fruit smells stronger, and flies love it. Mould smells bad and triggers an instinct to stay away.

4. **Choosing an action** (`src/sim/simulation.js`). Ten times a second the fly checks, in order: escape, sleep, keep eating, avoid mould, walk toward food, follow stripes, or otherwise wander, pause or clean itself. Each choice depends on how active the relevant brain areas are.

5. **Drawing** (`src/scene/`). The fly is built in code at its real size, about 2.6 mm long. It walks on six legs, moving three at a time. At night the view switches to a black-and-white infrared camera.

**Try switching areas off in the Brain tab:**

- Switch off **smell** and the fly can't find fruit.
- Switch off **movement** and it stops.
- Switch off **feeding** and it reaches food but can't eat.
- Switch off **vision** and the shadow no longer scares it.

## Project layout

```
index.html
scripts/preprocess_flywire.py   turns FlyWire data into brain-model.json (only needed to rebuild it)
data_raw/                       put FlyWire CSV files here if you want to rebuild
src/
  data/brain-model.json         the brain map used by the game
  sim/                          brain model, senses, day/night clock, recorder, simulation
  scene/                        3D view: dish, fly, food, textures
  ui/                           top bar, on-screen readouts, toolbar, side panels
  audio/audio.js                sound effects made in code (no audio files)
  store.js                      shared app state and autosave
  utils/save.js                 saving in the browser, file downloads
legacy/                         the previous version of the game, kept for reference
```

There are no image or sound files. Everything is generated in code when the page loads.

## What is real and what is simplified

**Real**, from the FlyWire data:

- which brain area each cell belongs to
- the connection counts between areas
- the chemical labels on each connection
- the example cell IDs

**Simplified or set by hand:**

- how the world turns into brain inputs
- the rules for choosing an action
- how hunger, thirst and tiredness change over time

Fifteen areas is a huge simplification of a real brain. This is a model shaped by the real wiring, not a copy of the real brain.

## Data and references

FlyWire FAFB v783 (Codex export). The connection table comes from the Princeton/Seung lab.

- Dorkenwald et al. (2024). Neuronal wiring diagram of an adult brain. *Nature* 634, 124–138.
- Schlegel et al. (2024). Whole-brain annotation and multi-connectome cell typing of *Drosophila*. *Nature* 634, 139–152.
- Eckstein et al. (2024). Neurotransmitter classification from electron microscopy images at synaptic sites in *Drosophila melanogaster*. *Cell* 187, 2574–2594.
- Dayan & Abbott (2001). *Theoretical Neuroscience*, ch. 7. MIT Press.

The About tab in the app lists the full set of references.

## Built with

Vite, React, three.js (React Three Fiber and drei), zustand and the Web Audio API. Python with pandas is used only for preparing the data.
