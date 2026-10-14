import { SUBSTRATES, FRUIT_AGE, DROP_LIFETIME } from './config'

// Physical model of what the fly can sense from where it stands.
// Odour and humidity both fall off with distance from the substrate edge;
// the constants are tuned for an arena tens of millimetres across.

const ODOUR_LENGTH = 9 // mm at which odour intensity halves
const HUMIDITY_LENGTH = 5
const MOULD_LENGTH = 6

export function substrateStage(s, now) {
  const def = SUBSTRATES[s.type]
  const age = now - s.placedAt
  if (def.kind === 'drop') return age > DROP_LIFETIME * 0.8 ? 'drying' : 'fresh'
  if (age >= FRUIT_AGE.mouldAt) return 'mouldy'
  if (age >= FRUIT_AGE.fermentAt) return 'fermenting'
  return 'fresh'
}

// Effective footprint shrinks as a droplet evaporates or a fruit is eaten.
export function effectiveRadius(s, now) {
  const def = SUBSTRATES[s.type]
  if (def.kind === 'drop') {
    const life = Math.max(0, 1 - (now - s.placedAt) / DROP_LIFETIME)
    return def.radius * Math.sqrt(Math.max(0.05, Math.min(life, s.amount)))
  }
  return def.radius * (0.75 + 0.25 * s.amount)
}

export function senseSubstrates(fly, substrates, needs, preferences, now) {
  const hunger = needs.hunger / 100
  const thirst = needs.thirst / 100
  let maxOdour = 0
  let humidity = 0
  let mouldOdour = 0
  let nearestMould = null
  let best = null
  const readings = []

  for (const s of substrates) {
    const def = SUBSTRATES[s.type]
    const stage = substrateStage(s, now)
    const r = effectiveRadius(s, now)
    const centre = Math.hypot(fly.x - s.x, fly.z - s.z)
    const edge = Math.max(0, centre - r)
    const amountFactor = 0.4 + 0.6 * s.amount

    if (stage === 'mouldy') {
      const m = amountFactor / (1 + (edge / MOULD_LENGTH) ** 2)
      mouldOdour = Math.max(mouldOdour, m)
      if (!nearestMould || edge < nearestMould.edge) nearestMould = { s, edge }
      readings.push({ s, stage, edge, odour: 0, appeal: -1 })
      continue
    }

    const stageGain = stage === 'fermenting' ? 1.45 : 1
    const odour = (def.scent * stageGain * amountFactor) / (1 + (edge / ODOUR_LENGTH) ** 2)
    const humid = def.water > 30 ? (0.9 * amountFactor) / (1 + (edge / HUMIDITY_LENGTH) ** 2) : 0
    maxOdour = Math.max(maxOdour, odour)
    humidity = Math.max(humidity, humid)

    // Which internal need this substrate can satisfy.
    // A sated fly ignores food: drive starts above a 15 % deficit.
    const h = Math.max(0, hunger - 0.15) / 0.85
    const w = Math.max(0, thirst - 0.15) / 0.85
    let match
    if (s.type === 'water') match = 1.5 * w
    else if (s.type === 'sucrose') match = 0.8 * h + 0.8 * w
    else match = 1.3 * h

    // Learned preference index in [-1, 1] scales innate attraction.
    const learned = 0.55 + (preferences[s.type] ?? 0.2)
    const signal = s.type === 'water' ? humid : odour + 0.4 * humid
    const appeal = signal * match * learned
    const reading = { s, stage, edge, odour, humid, appeal, radius: r }
    readings.push(reading)
    if (appeal > 0 && (!best || appeal > best.appeal)) best = reading
  }

  return { maxOdour, humidity, mouldOdour, nearestMould, best, readings }
}
