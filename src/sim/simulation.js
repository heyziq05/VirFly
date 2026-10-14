// The simulation: one fly, one arena, one connectome-derived brain.
//
// Everything here is plain JavaScript mutated in place. It is stepped once
// per animation frame by the viewport; React only sees a throttled snapshot
// (see store.js). The order inside step() is the causal loop of the model:
//
//   world  ->  sensing  ->  brain inputs  ->  brain step  ->  readout
//          ->  behaviour choice  ->  locomotion  ->  world / needs
//
// Decisions read *module activity*, not world state, so
// silencing a module in the Connectome panel changes what the fly does.

import model from '../data/brain-model.json'
import { createBrainEngine } from './brainEngine'
import { createRecorder } from './recorder'
import { senseSubstrates, substrateStage, effectiveRadius } from './sensing'
import {
  advanceZT, scheduledLight, circadianActivity, siestaDrive, formatTimeOfDay, ZT_HOURS_PER_SECOND,
} from './clock'
import {
  ARENA, FLY, SUBSTRATES, MAX_SUBSTRATES, NEED_RATES, FRASS, LEVELS, MAX_LEVEL,
  DROP_LIFETIME, BEHAVIOURS, NOZZLE_ANGLE,
} from './config'

const BRAIN_DT = 0.1
const HOLD_HEIGHT = 2.5 // mm above the paper while being carried
const TAU = Math.PI * 2
const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (v, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v)
const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU
  while (a < -Math.PI) a += TAU
  return a
}

let uid = 1
const nextId = (p) => `${p}${(uid++).toString(36)}`

export function createSimulation(saved) {
  const brain = createBrainEngine(model)
  const recorder = createRecorder()
  const listeners = new Set()

  const sim = {
    brain,
    recorder,
    t: 0,
    zt: saved?.zt ?? 1.0,
    lightMode: 'auto', // 'auto' | 'on' | 'off'
    light: 1, // smoothed illumination 0..1
    fly: {
      x: saved?.fly?.x ?? 6,
      z: saved?.fly?.z ?? 4,
      y: 0,
      heading: rand(-Math.PI, Math.PI),
      speed: 0,
      angular: 0,
      behaviour: 'stop',
      boutStart: 0,
      boutEnd: 1.5,
      target: null,
      targetId: null,
      flight: null,
      per: 0, // proboscis extension 0..1
      groom: 'front',
      lastMealEnd: -999,
      contactId: null,
      held: false,
    },
    needs: {
      hunger: 40, thirst: 35, energy: 80, valence: 55, curiosity: 60, habituation: 10,
      ...(saved?.needs ?? {}),
    },
    preferences: {
      banana: 0.2, water: 0.2, sucrose: 0.2, apple: 0.2, yeast: 0.2, grape: 0.2,
      ...(saved?.preferences ?? {}),
    },
    progression: { level: 1, carePoints: 0, ...(saved?.progression ?? {}) },
    stats: { meals: 0, cleaned: 0, escapes: 0, stimuli: 0, ...(saved?.stats ?? {}) },
    substrates: (saved?.substrates ?? []).map((s) => ({ ...s, id: nextId('s'), placedAt: -s.age })),
    frass: (saved?.frass ?? []).map((f) => ({ ...f, id: nextId('f') })),
    stimuli: { puffAt: -99, puffFrom: 0, loomAt: -99, loomAz: 0, touchAt: -99, drum: false, drumDir: 1, drumSince: 0 },
    hygiene: 100,
    novelty: 0,
    readout: {},
    sensed: null,
    labels: { stimulus: 'Nothing special', decision: 'Resting in place' },
    log: [],
    worldVersion: 0,
    sessionStart: Date.now(),
    _brainAcc: 0,
    _lastEscape: -99,
    _frassAt: 30,
    _careCooldown: {},
  }

  // ---------------------------------------------------------------- helpers

  function emit(type, payload) {
    for (const fn of listeners) fn(type, payload)
  }

  function note(text, kind = 'info') {
    sim.log.unshift({ t: sim.t, zt: formatTimeOfDay(sim.zt), text, kind })
    if (sim.log.length > 80) sim.log.length = 80
    emit('log')
  }

  function bumpWorld() {
    sim.worldVersion++
    emit('world')
  }

  function addCare(points, reason) {
    const p = sim.progression
    p.carePoints = Math.round((p.carePoints + points) * 100) / 100
    if (p.level < MAX_LEVEL && p.carePoints >= LEVELS[p.level + 1]) {
      p.level++
      const unlocked = Object.values(SUBSTRATES).filter((s) => s.level === p.level).map((s) => s.label)
      note(`Reached care level ${p.level}. ${unlocked.length ? `New: ${unlocked.join(', ')}.` : ''}`, 'level')
      emit('toast', `Care level ${p.level}${unlocked.length ? `: ${unlocked.join(', ')} now available` : ''}`)
    }
    if (reason) emit('care', reason)
  }

  function setBehaviour(b, duration = 0) {
    const f = sim.fly
    if (f.behaviour !== b) {
      f.behaviour = b
      f.boutStart = sim.t
    }
    f.boutEnd = sim.t + duration
  }

  function insideArena(x, z, margin) {
    return Math.hypot(x, z) <= ARENA.radius - margin
  }

  function randomFloorPoint(nearWall = Math.random() < 0.55) {
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU)
      const r = nearWall
        ? rand(0.78, 0.93) * ARENA.radius
        : Math.sqrt(Math.random()) * 0.8 * ARENA.radius
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (!sim.substrates.some((s) => Math.hypot(x - s.x, z - s.z) < SUBSTRATES[s.type].radius + 2)) return [x, z]
    }
    return [0, 0]
  }

  // ---------------------------------------------------------------- actions

  function placeSubstrate(type, x, z) {
    const def = SUBSTRATES[type]
    if (!def) return false
    if (def.level > sim.progression.level) {
      emit('toast', `${def.label} unlocks at care level ${def.level}`)
      return false
    }
    if (sim.substrates.length >= MAX_SUBSTRATES) {
      emit('toast', `The dish can hold ${MAX_SUBSTRATES} items. Remove one first.`)
      return false
    }
    if (!insideArena(x, z, def.radius + 0.8)) {
      emit('toast', 'Too close to the wall')
      return false
    }
    if (sim.substrates.some((s) => Math.hypot(x - s.x, z - s.z) < def.radius + SUBSTRATES[s.type].radius + 0.6)) {
      emit('toast', 'Too close to another item')
      return false
    }
    const f = sim.fly
    if (Math.hypot(x - f.x, z - f.z) < def.radius + FLY.clearance && f.y < 0.2) {
      emit('toast', 'Too close to the fly')
      return false
    }
    sim.substrates.push({ id: nextId('s'), type, x, z, rot: rand(0, TAU), placedAt: sim.t, amount: 1 })
    sim.novelty = Math.min(1, sim.novelty + 0.6)
    note(`Placed ${def.label.toLowerCase()} at (${x.toFixed(1)}, ${z.toFixed(1)}) mm`, 'place')
    emit('sfx', 'place')
    bumpWorld()
    return true
  }

  function removeSubstrate(id) {
    const s = sim.substrates.find((q) => q.id === id)
    if (!s) return
    const stage = substrateStage(s, sim.t)
    sim.substrates = sim.substrates.filter((q) => q.id !== id)
    if (sim.fly.targetId === id) sim.fly.targetId = null
    if (stage === 'mouldy') {
      sim.stats.cleaned++
      addCare(1, 'clean')
      sim.needs.valence = clamp(sim.needs.valence + 4)
      note(`Removed mouldy ${SUBSTRATES[s.type].label.toLowerCase()}`, 'clean')
    } else {
      note(`Removed ${SUBSTRATES[s.type].label.toLowerCase()}`, 'clean')
    }
    emit('sfx', 'remove')
    bumpWorld()
  }

  function removeFrass(id) {
    const before = sim.frass.length
    sim.frass = sim.frass.filter((q) => q.id !== id)
    if (sim.frass.length === before) return
    sim.stats.cleaned++
    addCare(0.25, 'clean')
    sim.needs.habituation = clamp(sim.needs.habituation + 0.4)
    emit('sfx', 'remove')
    bumpWorld()
  }

  // Cleans the waste item nearest the fly: mouldy substrate first, then frass.
  function cleanNearest() {
    const f = sim.fly
    const mouldy = sim.substrates.filter((s) => substrateStage(s, sim.t) === 'mouldy')
    const d = (o) => Math.hypot(o.x - f.x, o.z - f.z)
    if (mouldy.length) {
      mouldy.sort((a, b) => d(a) - d(b))
      removeSubstrate(mouldy[0].id)
      return
    }
    if (!sim.frass.length) {
      emit('toast', 'The dish is already clean')
      return
    }
    const n = Math.min(4, sim.frass.length)
    const sorted = [...sim.frass].sort((a, b) => d(a) - d(b)).slice(0, n)
    for (const q of sorted) removeFrass(q.id)
    note(`Cleaned up ${n} dropping${n > 1 ? 's' : ''}`, 'clean')
  }

  // Removes frass within `radius` mm of a point on the floor.
  function cleanAt(x, z, radius = 2.5) {
    const hits = sim.frass.filter((q) => Math.hypot(q.x - x, q.z - z) < radius)
    for (const q of hits) removeFrass(q.id)
    if (hits.length) note(`Cleaned up ${hits.length} dropping${hits.length > 1 ? 's' : ''}`, 'clean')
    return hits.length
  }

  function stimulate(kind) {
    const st = sim.stimuli
    const f = sim.fly
    if (kind === 'puff') {
      st.puffAt = sim.t
      st.puffFrom = NOZZLE_ANGLE
      sim.stats.stimuli++
      // Punishment paired with feeding: the mushroom-body dopamine pathway
      // writes an aversive memory for the substrate being eaten.
      if ((f.behaviour === 'feed' || f.behaviour === 'drink') && f.contactId) {
        const s = sim.substrates.find((q) => q.id === f.contactId)
        if (s) {
          const p = sim.preferences[s.type]
          sim.preferences[s.type] = Math.max(-1, p + 0.35 * (-1 - p))
          note(`Air puff while eating ${SUBSTRATES[s.type].label.toLowerCase()}: it will like this food less`, 'stim')
        }
      } else {
        note('Air puff', 'stim')
      }
      sim.needs.valence = clamp(sim.needs.valence - 3)
      emit('sfx', 'puff')
    } else if (kind === 'loom') {
      st.loomAt = sim.t
      st.loomAz = f.heading + rand(-1.2, 1.2)
      sim.stats.stimuli++
      note('Shadow shown', 'stim')
      emit('sfx', 'loom')
    } else if (kind === 'drum') {
      st.drum = !st.drum
      st.drumSince = sim.t
      if (st.drum) st.drumDir = Math.random() < 0.5 ? 1 : -1
      note(st.drum ? `Moving stripes on (${st.drumDir > 0 ? 'clockwise' : 'anticlockwise'})` : 'Moving stripes off', 'stim')
      emit('sfx', 'toggle')
    }
    emit('world')
  }

  function touchFly() {
    sim.stimuli.touchAt = sim.t
    sim.needs.habituation = clamp(sim.needs.habituation + 1.2)
    note('Touched the fly with a brush', 'stim')
    emit('sfx', 'touch')
  }

  function silence(id, on) {
    brain.setSilenced(id, on)
    const m = brain.modules.find((q) => q.id === id)
    note(`${on ? 'Switched off' : 'Switched back on'}: ${m?.label ?? id}`, 'stim')
  }

  // ---- holding the fly (drag and drop) ----

  function pickUp() {
    const f = sim.fly
    if (f.held) return
    f.held = true
    f.flight = null
    f.contactId = null
    f.targetId = null
    f.target = null
    setBehaviour('held', 999)
    note('Picked up the fly', 'stim')
    emit('sfx', 'touch')
  }

  function holdMove(x, z) {
    const f = sim.fly
    if (!f.held) return
    const maxR = ARENA.radius - FLY.clearance
    const r = Math.hypot(x, z)
    if (r > maxR) {
      x *= maxR / r
      z *= maxR / r
    }
    const dx = x - f.x
    const dz = z - f.z
    // Turn the body gently toward the direction it is being carried.
    if (Math.hypot(dx, dz) > 0.05) {
      f.heading = wrapAngle(f.heading + wrapAngle(Math.atan2(dz, dx) - f.heading) * 0.15)
    }
    f.x = x
    f.z = z
  }

  function release() {
    const f = sim.fly
    if (!f.held) return
    // Never drop the fly inside a piece of food.
    for (const s of sim.substrates) {
      const rr = effectiveRadius(s, sim.t) + FLY.clearance
      const ox = f.x - s.x
      const oz = f.z - s.z
      const d = Math.hypot(ox, oz) || 1e-3
      if (d < rr) {
        f.x = s.x + (ox / d) * rr
        f.z = s.z + (oz / d) * rr
      }
    }
    f.held = false
    setBehaviour('stop', rand(0.6, 1.2))
    // Landing on the paper is felt as a touch; a calm fly walks off, a
    // nervous one may fly.
    sim.stimuli.touchAt = sim.t
    sim.needs.habituation = clamp(sim.needs.habituation + 1)
    note(`Put the fly down at (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) mm`, 'stim')
  }

  function setLightMode(mode) {
    sim.lightMode = mode
    note(`Lights: ${mode === 'auto' ? 'normal day and night' : mode === 'on' ? 'always on' : 'always off'}`, 'light')
    emit('world')
  }

  // ------------------------------------------------------------- brain tick

  function brainTick() {
    const f = sim.fly
    const n = sim.needs
    const st = sim.stimuli
    const now = sim.t
    const sensed = senseSubstrates(f, sim.substrates, n, sim.preferences, now)
    sim.sensed = sensed

    const sincePuff = now - st.puffAt
    const sinceLoom = now - st.loomAt
    const sinceTouch = now - st.touchAt
    const puff = sincePuff < 0.6 ? 1 - sincePuff / 0.6 : 0
    // A looming disc expands over ~1 s; the visual signal rises with it.
    const loom = sinceLoom < 1.3 ? Math.min(1, sinceLoom / 0.8) * (sinceLoom < 1.0 ? 1 : 1 - (sinceLoom - 1) / 0.3) : 0
    const touchStartle = 1 - n.habituation / 140
    const touch = f.held ? 0.6 * touchStartle : sinceTouch < 0.5 ? (1 - sinceTouch / 0.5) * touchStartle : 0
    const dark = 1 - sim.light
    const tiredness = 1 - n.energy / 100
    const dirt = 1 - sim.hygiene / 100
    const feeding = f.behaviour === 'feed' || f.behaviour === 'drink'
    const moving = f.speed > 0.5 ? 1 : 0
    const contact = feeding && f.contactId ? sim.substrates.find((q) => q.id === f.contactId) : null
    const stimulated = puff > 0 || loom > 0 || touch > 0

    // World -> sensory and state modules.
    const B = brain
    B.setInput('olfactory_al', 0.04 + 0.9 * sensed.maxOdour + 0.4 * sensed.mouldOdour)
    B.setInput('gustatory', contact ? (contact.type === 'water' ? 0.45 : 0.9) : 0)
    B.setInput('visual', 0.06 + 0.22 * sim.light + 1.1 * loom + (st.drum ? 0.5 * sim.light + 0.1 : 0))
    B.setInput('mechanosensory', 0.04 + 1.3 * puff + 1.1 * touch + 0.6 * sensed.humidity)
    B.setInput('lateral_horn', 0.02 + 1.0 * sensed.mouldOdour + 0.12 * sensed.maxOdour)
    B.setInput('neurosecretory', 0.08 + 0.6 * (n.hunger / 100) + 0.2 * (n.thirst / 100))
    B.setInput(
      'cx_sleep',
      Math.max(0, 0.04 + 0.5 * tiredness + 0.42 * dark + 0.12 * siestaDrive(sim.zt) * sim.light - (stimulated ? 0.6 : 0))
    )
    B.setInput('integration_hub', 0.05 + 0.3 * (n.curiosity / 100) + 0.45 * sim.novelty)
    B.setInput('arousal_stress', 0.03 + 0.9 * puff + 0.9 * loom + 0.8 * touch + 0.22 * dirt + 0.2 * sensed.mouldOdour)
    B.setInput('cx_navigation', 0.04 + 0.12 * moving + (st.drum ? 0.4 * sim.light : 0))
    let dan = 0
    if (contact) dan += 0.3 + 0.35 * Math.max(0, sim.preferences[contact.type])
    if (puff > 0) dan += 0.5 * puff
    B.setInput('mb_dan', dan)
    // Taste on the labellum is the trigger for proboscis extension: the
    // feeding motor module is driven by gustatory activity during contact.
    B.setInput('feeding_motor', contact ? 0.8 * B.get('gustatory') : 0)
    B.step()

    const r = {
      olf: B.get('olfactory_al'), gus: B.get('gustatory'), vis: B.get('visual'), mech: B.get('mechanosensory'),
      lh: B.get('lateral_horn'), kc: B.get('mb_kenyon'), dan: B.get('mb_dan'), mbon: B.get('mb_output'),
      nav: B.get('cx_navigation'), sleep: B.get('cx_sleep'), ns: B.get('neurosecretory'),
      hub: B.get('integration_hub'), arousal: B.get('arousal_stress'),
      dn: B.get('descending_motor'), fm: B.get('feeding_motor'),
    }
    sim.readout = r
    if (sim.fly.held) {
      sim.labels = { stimulus: 'Being held by you', decision: `Kicking its legs, alarm ${(r.arousal * 100).toFixed(0)}%` }
      return
    }
    decide(r, sensed, { puff, loom, touch, stimulated })
  }

  // --------------------------------------------------------- action select

  function decide(r, sensed, stim) {
    const f = sim.fly
    const n = sim.needs
    const now = sim.t
    const cur = f.behaviour
    const motorOK = !brain.isSilenced('descending_motor')
    const perOK = !brain.isSilenced('feeding_motor')
    let stimulus = 'Nothing special'
    let decision = BEHAVIOURS[cur].label

    if (cur === 'flight') {
      sim.labels = { stimulus: sim.labels.stimulus, decision: 'Flying' }
      return
    }

    // 1. Escape. Giant-fibre-like takeoff when a startle stimulus is
    //    registered by the relevant sensory module and arousal is high.
    const visualThreat = stim.loom > 0.25 && r.vis > 0.32
    const mechThreat = (stim.puff > 0.2 || stim.touch > 0.2) && r.mech > 0.3
    const refractory = now - sim._lastEscape < 1.6
    if ((visualThreat || mechThreat) && !refractory && r.arousal > 0.22 && motorOK && n.energy > 4) {
      sim._lastEscape = now
      const fromAngle = visualThreat ? sim.stimuli.loomAz : stim.puff > 0 ? sim.stimuli.puffFrom : f.heading + Math.PI
      takeoff(fromAngle)
      sim.stats.escapes++
      sim.labels = {
        stimulus: visualThreat ? 'A shadow coming at it' : stim.puff > 0 ? 'A puff of air' : 'A brush touch',
        decision: `Escape! Alarm level ${(r.arousal * 100).toFixed(0)}%`,
      }
      note(`Flew away (${visualThreat ? 'saw a shadow' : 'felt something'})`, 'behaviour')
      return
    }
    if (stim.touch > 0 && motorOK && cur !== 'avoid') {
      // Sub-threshold touch: walk away rather than fly.
      const a = f.heading + Math.PI + rand(-0.6, 0.6)
      f.target = [f.x + Math.cos(a) * 8, f.z + Math.sin(a) * 8]
      setBehaviour('avoid', 1.2)
      sim.labels = { stimulus: 'A gentle touch it is used to', decision: 'Walks away calmly' }
      return
    }

    // 2. Sleep, with hysteresis. Flies wake on startle (handled above).
    if (cur === 'sleep') {
      if (r.sleep < 0.28 || stim.stimulated) {
        setBehaviour('stop', rand(1, 2.5))
        note('Woke up', 'behaviour')
      } else {
        sim.labels = { stimulus: sim.light < 0.5 ? 'Darkness' : 'Tiredness', decision: `Asleep, sleep drive ${(r.sleep * 100).toFixed(0)}%` }
        return
      }
    } else if (r.sleep > 0.46 && cur !== 'feed' && cur !== 'drink') {
      setBehaviour('sleep', 999)
      f.target = null
      note('Fell asleep', 'behaviour')
      sim.labels = { stimulus: sim.light < 0.5 ? 'Darkness' : 'Tiredness', decision: `Falls asleep, sleep drive ${(r.sleep * 100).toFixed(0)}%` }
      return
    }

    // 3. Ongoing meal.
    if (cur === 'feed' || cur === 'drink') {
      const s = sim.substrates.find((q) => q.id === f.contactId)
      const sated = s && (s.type === 'water' ? n.thirst < 8 : s.type === 'sucrose' ? n.hunger < 10 && n.thirst < 10 : n.hunger < 10)
      const tooLong = now - f.boutStart > 9
      if (!s || s.amount <= 0 || sated || tooLong || !perOK || substrateStage(s, now) === 'mouldy') {
        endMeal(s)
      } else {
        sim.labels = {
          stimulus: `Tasting ${SUBSTRATES[s.type].label.toLowerCase()}`,
          decision: `${cur === 'feed' ? 'Eating' : 'Drinking'}, feeding signal ${(r.fm * 100).toFixed(0)}%`,
        }
        return
      }
    }

    // 4. Innate aversion to mould via the lateral horn.
    if (sensed.nearestMould && sensed.nearestMould.edge < 6 && r.lh > 0.22 && motorOK) {
      const m = sensed.nearestMould.s
      const a = Math.atan2(f.z - m.z, f.x - m.x) + rand(-0.4, 0.4)
      f.target = [f.x + Math.cos(a) * 10, f.z + Math.sin(a) * 10]
      setBehaviour('avoid', 1.5)
      sim.labels = { stimulus: 'Smell of mould', decision: `Moves away, instinct ${(r.lh * 100).toFixed(0)}%` }
      return
    }

    // 5. Odour- or humidity-guided approach and contact.
    const best = sensed.best
    if (best && motorOK) {
      const sensoryDrive = best.s.type === 'water' ? r.mech : r.olf + 0.5 * r.mech
      const learnedBias = 1 + 0.6 * r.mbon
      if (best.edge < 0.7) {
        if (perOK) {
          f.contactId = best.s.id
          f.targetId = best.s.id
          const drink = best.s.type === 'water'
          setBehaviour(drink ? 'drink' : 'feed', 9)
          sim.labels = { stimulus: `Touching ${SUBSTRATES[best.s.type].label.toLowerCase()}`, decision: drink ? 'Puts out its mouthpart to drink' : 'Puts out its mouthpart to eat' }
          return
        }
        stimulus = `Touching ${SUBSTRATES[best.s.type].label.toLowerCase()}`
        decision = 'Wants to eat, but feeding is switched off'
      } else if (sensoryDrive * learnedBias > 0.12 && best.appeal > 0.035) {
        f.targetId = best.s.id
        setBehaviour('approach', 0.5)
        sim.labels = {
          stimulus: `${best.s.type === 'water' ? 'Damp air from' : 'Smell of'} ${SUBSTRATES[best.s.type].label.toLowerCase()}, ${best.edge.toFixed(1)} mm away`,
          decision: `Walks toward it, ${best.s.type === 'water' ? 'humidity' : 'smell'} signal ${(sensoryDrive * 100).toFixed(0)}%`,
        }
        return
      }
    }
    if (cur === 'approach') setBehaviour('stop', 0.6)

    // 6. Optomotor turning with the rotating grating.
    if (sim.stimuli.drum && r.vis > 0.24 && r.nav > 0.1 && motorOK) {
      setBehaviour('optomotor', 0.5)
      sim.labels = { stimulus: 'Moving stripes', decision: `Turns to follow them, navigation ${(r.nav * 100).toFixed(0)}%` }
      if (now - sim.stimuli.drumSince > 12 && !sim._careCooldown.drum) {
        sim._careCooldown.drum = true
        addCare(0.5, 'stim')
        sim.needs.curiosity = clamp(sim.needs.curiosity - 15)
        sim.needs.valence = clamp(sim.needs.valence + 5)
      }
      return
    }
    if (cur === 'optomotor') setBehaviour('stop', 0.5)

    // 7. Spontaneous bouts: walk, pause, groom.
    if (now >= f.boutEnd) {
      const postMeal = now - f.lastMealEnd < 6 ? 0.45 : 0
      const pGroom = 0.07 + 0.3 * (1 - sim.hygiene / 100) + postMeal
      const pWalk = motorOK ? (0.12 + 0.55 * r.hub + 0.45 * circadianActivity(sim.zt)) * (0.4 + 0.6 * n.energy / 100) : 0
      const pStop = 0.35 + 0.4 * (1 - n.energy / 100)
      const total = pGroom + pWalk + pStop
      const u = Math.random() * total
      if (u < pGroom) {
        f.groom = Math.random() < 0.6 ? 'front' : 'hind'
        setBehaviour('groom', rand(2.5, 6))
      } else if (u < pGroom + pWalk) {
        f.target = randomFloorPoint()
        setBehaviour('walk', rand(2, 7))
      } else {
        setBehaviour('stop', rand(0.8, 3.5))
      }
    }
    if (f.behaviour === 'walk') {
      stimulus = sim.novelty > 0.2 ? 'Something new in the dish' : 'Nothing special'
      decision = `Exploring, curiosity signal ${(r.hub * 100).toFixed(0)}%`
    } else if (f.behaviour === 'groom') {
      stimulus = sim.hygiene < 70 ? 'A dirty dish' : 'Just ate'
      decision = f.groom === 'front' ? 'Cleaning its head and front legs' : 'Cleaning its wings and body'
    } else if (f.behaviour === 'stop' && decision === BEHAVIOURS[cur].label) {
      decision = motorOK ? `Resting in place, movement signal ${(r.dn * 100).toFixed(0)}%` : 'Cannot move, movement is switched off'
    }
    sim.labels = { stimulus, decision }
  }

  function endMeal(s) {
    const f = sim.fly
    const n = sim.needs
    const duration = sim.t - f.boutStart
    if (s && duration > 1.2) {
      sim.stats.meals++
      // Appetitive memory: reward pushes the preference index upward.
      const reward = s.type === 'water' ? 0.4 : substrateStage(s, sim.t) === 'fermenting' ? 0.95 : 0.75
      const p = sim.preferences[s.type]
      sim.preferences[s.type] = Math.min(1, p + 0.2 * (reward - p))
      n.valence = clamp(n.valence + 6)
      n.habituation = clamp(n.habituation + 0.8)
      if (!sim._careCooldown.meal || sim.t - sim._careCooldown.meal > 8) {
        sim._careCooldown.meal = sim.t
        addCare(1, 'meal')
      }
      note(`${s.type === 'water' ? 'Drank from' : 'Ate'} ${SUBSTRATES[s.type].label.toLowerCase()} for ${duration.toFixed(1)} s`, 'behaviour')
      sim._frassAt = Math.min(sim._frassAt, sim.t + FRASS.postMealInterval)
    }
    f.lastMealEnd = sim.t
    f.contactId = null
    f.targetId = null
    setBehaviour('stop', rand(0.6, 1.5))
  }

  function takeoff(threatAngle) {
    const f = sim.fly
    // Land roughly opposite the threat, somewhere free on the floor.
    let dest = null
    for (let i = 0; i < 20; i++) {
      const a = threatAngle + Math.PI + rand(-0.9, 0.9)
      const dist = rand(10, 22)
      const x = f.x + Math.cos(a) * dist
      const z = f.z + Math.sin(a) * dist
      if (insideArena(x, z, 2.5) && !sim.substrates.some((s) => Math.hypot(x - s.x, z - s.z) < SUBSTRATES[s.type].radius + 1.8)) {
        dest = [x, z]
        break
      }
    }
    if (!dest) dest = randomFloorPoint(false)
    const dist = Math.hypot(dest[0] - f.x, dest[1] - f.z)
    f.flight = {
      from: [f.x, f.z],
      to: dest,
      t0: sim.t,
      dur: 0.35 + dist / 75,
      peak: Math.min(ARENA.ceiling - 1, 2 + dist * 0.14),
    }
    f.contactId = null
    f.targetId = null
    f.target = null
    setBehaviour('flight', f.flight.dur)
    emit('sfx', 'takeoff')
  }

  // ------------------------------------------------------------ locomotion

  function steerTowards(tx, tz, speedTarget, dt, turnRate = 7) {
    const f = sim.fly
    let dx = tx - f.x
    let dz = tz - f.z
    // Obstacle deflection around substrates that are not the target.
    for (const s of sim.substrates) {
      if (s.id === f.targetId) continue
      const r = effectiveRadius(s, sim.t) + FLY.clearance + 1.2
      const ox = f.x - s.x
      const oz = f.z - s.z
      const d = Math.hypot(ox, oz)
      if (d < r + 3) {
        const w = (r + 3 - d) / 3
        dx += (ox / d) * w * 6
        dz += (oz / d) * w * 6
      }
    }
    const desired = Math.atan2(dz, dx)
    const diff = wrapAngle(desired - f.heading)
    const maxTurn = turnRate * dt
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff))
    f.heading = wrapAngle(f.heading + turn)
    f.angular = turn / Math.max(dt, 1e-3)
    // Flies slow down for sharp turns.
    const align = Math.max(0.15, Math.cos(diff))
    f.speed += (speedTarget * align - f.speed) * Math.min(1, dt * 6)
    return Math.hypot(tx - f.x, tz - f.z)
  }

  function integrate(dt) {
    const f = sim.fly
    f.x += Math.cos(f.heading) * f.speed * dt
    f.z += Math.sin(f.heading) * f.speed * dt
    // Wall: clamp and slide along it (thigmotaxis falls out naturally).
    const r = Math.hypot(f.x, f.z)
    const maxR = ARENA.radius - FLY.clearance
    if (r > maxR) {
      f.x *= maxR / r
      f.z *= maxR / r
      const tangent = Math.atan2(f.z, f.x) + Math.PI / 2
      const diff = wrapAngle(tangent - f.heading)
      f.heading = wrapAngle(f.heading + (Math.abs(diff) < Math.PI / 2 ? diff : wrapAngle(diff + Math.PI)) * Math.min(1, dt * 5))
    }
    // Substrate bodies are solid.
    for (const s of sim.substrates) {
      const rr = effectiveRadius(s, sim.t) + 0.3
      const ox = f.x - s.x
      const oz = f.z - s.z
      const d = Math.hypot(ox, oz)
      if (d < rr && d > 1e-4) {
        f.x = s.x + (ox / d) * rr
        f.z = s.z + (oz / d) * rr
      }
    }
  }

  function locomote(dt) {
    const f = sim.fly
    const n = sim.needs
    if (f.held) {
      // Lifted a few millimetres off the paper and carried by the pointer.
      f.y += (HOLD_HEIGHT - f.y) * Math.min(1, dt * 10)
      f.speed = 0
      f.angular = 0
      return
    }
    const vigour = 0.55 + 0.45 * (n.energy / 100)
    const b = f.behaviour

    if (b === 'flight' && f.flight) {
      const fl = f.flight
      const u = Math.min(1, (sim.t - fl.t0) / fl.dur)
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
      const px = f.x
      const pz = f.z
      f.x = fl.from[0] + (fl.to[0] - fl.from[0]) * e
      f.z = fl.from[1] + (fl.to[1] - fl.from[1]) * e
      f.y = fl.peak * Math.sin(Math.PI * u)
      const vx = (f.x - px) / dt
      const vz = (f.z - pz) / dt
      f.speed = Math.hypot(vx, vz)
      if (f.speed > 1) {
        const desired = Math.atan2(vz, vx)
        f.heading = wrapAngle(f.heading + wrapAngle(desired - f.heading) * Math.min(1, dt * 10))
      }
      if (u >= 1) {
        f.y = 0
        f.flight = null
        f.speed = 0
        setBehaviour('stop', rand(0.8, 2))
      }
      return
    }

    f.y = Math.max(0, f.y - dt * 20)

    if (b === 'walk') {
      if (!f.target) f.target = randomFloorPoint()
      const d = steerTowards(f.target[0], f.target[1], 9 * vigour, dt)
      if (d < 1.2) f.target = randomFloorPoint()
    } else if (b === 'approach') {
      const s = sim.substrates.find((q) => q.id === f.targetId)
      if (s) {
        const rr = effectiveRadius(s, sim.t)
        const ax = s.x + ((f.x - s.x) / Math.max(1e-3, Math.hypot(f.x - s.x, f.z - s.z))) * rr
        const az = s.z + ((f.z - s.z) / Math.max(1e-3, Math.hypot(f.x - s.x, f.z - s.z))) * rr
        const d = Math.hypot(f.x - s.x, f.z - s.z) - rr
        // Slow down on final approach, as flies do at a food edge.
        steerTowards(ax, az, (d < 3 ? 4 : 12) * vigour, dt)
      }
    } else if (b === 'avoid') {
      if (f.target) steerTowards(f.target[0], f.target[1], 15 * vigour, dt, 9)
    } else if (b === 'optomotor') {
      const a = Math.atan2(f.z, f.x)
      const r = Math.hypot(f.x, f.z)
      const desiredR = Math.max(8, Math.min(ARENA.radius - 3, r))
      const da = sim.stimuli.drumDir * 0.25
      steerTowards(Math.cos(a + da) * desiredR, Math.sin(a + da) * desiredR, 8 * vigour, dt, 5)
    } else if (b === 'feed' || b === 'drink') {
      const s = sim.substrates.find((q) => q.id === f.contactId)
      f.speed *= Math.max(0, 1 - dt * 12)
      if (s) {
        const desired = Math.atan2(s.z - f.z, s.x - f.x)
        f.heading = wrapAngle(f.heading + wrapAngle(desired - f.heading) * Math.min(1, dt * 6))
      }
      f.angular = 0
    } else {
      f.speed *= Math.max(0, 1 - dt * 10)
      f.angular = 0
    }
    integrate(dt)
  }

  // ------------------------------------------------------------ physiology

  function physiology(dt) {
    const f = sim.fly
    const n = sim.needs
    const R = NEED_RATES
    const m = dt / 60
    const b = f.behaviour
    const asleep = b === 'sleep'
    n.hunger = clamp(n.hunger + R.hungerRise * m * (asleep ? 0.5 : 1))
    n.thirst = clamp(n.thirst + R.thirstRise * m * (asleep ? 0.5 : 1))
    if (b === 'flight') n.energy = clamp(n.energy - R.energyDrainFlight * m)
    else if (f.speed > 1) n.energy = clamp(n.energy - R.energyDrainWalk * m * (f.speed / 9))
    else if (asleep) n.energy = clamp(n.energy + R.energyRecoverSleep * m)
    else n.energy = clamp(n.energy + R.energyRecoverStill * m)
    const discomfort = 0.5 * (n.hunger > 75 ? 1 : 0) + 0.5 * (n.thirst > 75 ? 1 : 0) + (1 - sim.hygiene / 100)
    n.valence = clamp(n.valence + (-R.valenceDecay * (0.4 + discomfort) + (asleep ? 1 : 0)) * m)
    if (b === 'walk' || b === 'optomotor') n.curiosity = clamp(n.curiosity - 2.5 * m)
    else n.curiosity = clamp(n.curiosity + R.curiosityRecover * m)
    sim.novelty = Math.max(0, sim.novelty - dt * 0.05)

    // Ingestion.
    if ((b === 'feed' || b === 'drink') && f.contactId) {
      const s = sim.substrates.find((q) => q.id === f.contactId)
      if (s && f.per > 0.7) {
        const def = SUBSTRATES[s.type]
        const eaten = Math.min(s.amount, def.bite * dt)
        s.amount -= eaten
        n.hunger = clamp(n.hunger - def.nutrition * eaten)
        n.thirst = clamp(n.thirst - def.water * eaten)
        if (s.amount <= 0.001) {
          sim.substrates = sim.substrates.filter((q) => q.id !== s.id)
          note(`${def.label} is all gone`, 'behaviour')
          bumpWorld()
        }
      }
    }
    const perTarget = (b === 'feed' || b === 'drink') && !brain.isSilenced('feeding_motor') ? 1 : 0
    f.per += (perTarget - f.per) * Math.min(1, dt * 5)

    // Droplets evaporate; fruit that is fully mouldy stays until removed.
    let changed = false
    sim.substrates = sim.substrates.filter((s) => {
      if (SUBSTRATES[s.type].kind === 'drop' && sim.t - s.placedAt > DROP_LIFETIME) {
        note(`${SUBSTRATES[s.type].label} dried up`, 'info')
        changed = true
        return false
      }
      return true
    })
    if (changed) bumpWorld()

    // Frass deposition.
    if (sim.t > sim._frassAt && b !== 'flight' && b !== 'held' && sim.frass.length < FRASS.max) {
      sim.frass.push({
        id: nextId('f'),
        x: f.x - Math.cos(f.heading) * 1.3,
        z: f.z - Math.sin(f.heading) * 1.3,
        size: rand(0.16, 0.26),
      })
      sim._frassAt = sim.t + FRASS.baseInterval * rand(0.7, 1.3)
      bumpWorld()
    }

    const mouldy = sim.substrates.filter((s) => substrateStage(s, sim.t) === 'mouldy').length
    sim.hygiene = clamp(100 - sim.frass.length * 3.5 - mouldy * 18)

    if (!sim.stimuli.drum) sim._careCooldown.drum = false
  }

  // ------------------------------------------------------------------ step

  function step(rawDt) {
    const dt = Math.min(rawDt, 0.1)
    sim.t += dt
    sim.zt = advanceZT(sim.zt, dt)
    const targetLight = sim.lightMode === 'on' ? 1 : sim.lightMode === 'off' ? 0 : scheduledLight(sim.zt)
    sim.light += (targetLight - sim.light) * Math.min(1, dt * 2)

    sim._brainAcc += dt
    while (sim._brainAcc >= BRAIN_DT) {
      sim._brainAcc -= BRAIN_DT
      brainTick()
    }
    locomote(dt)
    physiology(dt)
    recorder.sample(sim.t, sim.fly, dt)
  }

  function serialise() {
    return {
      zt: sim.zt,
      fly: { x: sim.fly.x, z: sim.fly.z },
      needs: sim.needs,
      preferences: sim.preferences,
      progression: sim.progression,
      stats: sim.stats,
      substrates: sim.substrates.map(({ type, x, z, rot, amount, placedAt }) => ({ type, x, z, rot, amount, age: sim.t - placedAt })),
      frass: sim.frass.map(({ x, z, size }) => ({ x, z, size })),
    }
  }

  // Hours of ZT at an arbitrary past sim time, for CSV export.
  function ztAt(t) {
    return (((sim.zt - (sim.t - t) * ZT_HOURS_PER_SECOND) % 24) + 24) % 24
  }

  note('Session started with one female fly, 3 days old.', 'info')

  return Object.assign(sim, {
    step,
    placeSubstrate,
    removeSubstrate,
    removeFrass,
    cleanNearest,
    cleanAt,
    stimulate,
    touchFly,
    setLightMode,
    silence,
    pickUp,
    holdMove,
    release,
    serialise,
    ztAt,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  })
}
