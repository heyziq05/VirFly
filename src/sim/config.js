// Authored experiment and game parameters.
//
// Nothing in this file is derived from FlyWire. It is the hand-written layer
// that sits on top of the connectome-derived module graph: arena geometry,
// substrate properties, need dynamics and progression. All lengths are in
// millimetres and all durations in simulated seconds unless noted.

export const ARENA = {
  radius: 22, // inner floor radius of the dish
  wallHeight: 7,
  wallThickness: 0.9,
  ceiling: 6.2, // lid height; flight is clamped below this
}

export const FLY = {
  bodyLength: 2.6, // female, head to abdomen tip
  clearance: 1.5, // keep-out radius around the body centre
}

// One simulated day (24 h of Zeitgeber time) in real seconds.
export const DAY_LENGTH_S = 240
export const LIGHTS_ON_ZT = 0
export const LIGHTS_OFF_ZT = 12

// Substrates the experimenter can place in the arena.
//   scent      volatile attractiveness at the source (0..~1.3)
//   nutrition  satiety restored per full unit consumed
//   water      hydration restored per full unit consumed
//   bite       units consumed per second of feeding
//   kind       'fruit' ages through fresh -> fermenting -> mouldy
//              'drop'  evaporates and shrinks instead of spoiling
export const SUBSTRATES = {
  banana: {
    id: 'banana', label: 'Banana slice', short: 'BAN', kind: 'fruit',
    radius: 3.4, height: 2.0, scent: 1.0, nutrition: 70, water: 10, bite: 0.03, level: 1,
  },
  water: {
    id: 'water', label: 'Water droplet', short: 'H2O', kind: 'drop',
    radius: 1.3, height: 0.9, scent: 0.0, nutrition: 0, water: 120, bite: 0.07, level: 1,
  },
  sucrose: {
    id: 'sucrose', label: 'Sugar water', short: 'SUG', kind: 'drop',
    radius: 1.2, height: 0.8, scent: 0.12, nutrition: 40, water: 60, bite: 0.06, level: 2,
  },
  apple: {
    id: 'apple', label: 'Apple slice', short: 'APL', kind: 'fruit',
    radius: 3.2, height: 1.5, scent: 0.8, nutrition: 60, water: 14, bite: 0.03, level: 2,
  },
  yeast: {
    id: 'yeast', label: 'Yeast paste', short: 'YST', kind: 'fruit',
    radius: 1.8, height: 1.0, scent: 1.2, nutrition: 90, water: 4, bite: 0.04, level: 3,
  },
  grape: {
    id: 'grape', label: 'Grape, halved', short: 'GRP', kind: 'fruit',
    radius: 2.9, height: 2.2, scent: 1.1, nutrition: 55, water: 22, bite: 0.03, level: 4,
  },
}

// Fruit ageing (seconds since placement). Fermenting fruit is *more*
// attractive to Drosophila (ethanol, acetic acid, esters); mould is aversive.
export const FRUIT_AGE = { fermentAt: 45, mouldAt: 110 }
export const DROP_LIFETIME = 150 // seconds until a droplet has evaporated

export const MAX_SUBSTRATES = 5

// Need dynamics, per simulated minute.
export const NEED_RATES = {
  hungerRise: 5.5,
  thirstRise: 7.0,
  energyDrainWalk: 4.0,
  energyDrainFlight: 30.0,
  energyRecoverSleep: 16.0,
  energyRecoverStill: 2.0,
  valenceDecay: 2.0,
  curiosityRecover: 3.0,
}

// Frass (excreta) deposition. Flies defecate more after feeding.
export const FRASS = { baseInterval: 45, postMealInterval: 12, max: 24 }

// Care points needed to reach each husbandry level (index = level).
export const LEVELS = [0, 0, 5, 12, 22, 35]
export const MAX_LEVEL = LEVELS.length - 1

// Azimuth of the air-puff nozzle around the arena (radians, world x/z).
export const NOZZLE_ANGLE = -0.75

export const STIMULI = {
  puff: { id: 'puff', label: 'Air puff', key: 'Q', note: 'A short puff of air. Startles the fly.' },
  loom: { id: 'loom', label: 'Shadow', key: 'W', note: 'A dark shape that grows quickly, like something about to hit. Flies escape from it.' },
  drum: { id: 'drum', label: 'Stripes', key: 'E', note: 'Moving stripes around the dish. Flies turn to follow them.' },
}

// Ethogram categories. Colours were chosen to stay distinguishable on a dark
// background and for the common forms of colour-vision deficiency.
export const BEHAVIOURS = {
  walk: { label: 'Walk', color: '#6f9fd8' },
  stop: { label: 'Pause', color: '#5b6470' },
  approach: { label: 'Go to food', color: '#4fb39a' },
  feed: { label: 'Eat', color: '#e0b04f' },
  drink: { label: 'Drink', color: '#7cc7e8' },
  groom: { label: 'Clean itself', color: '#b58ad6' },
  avoid: { label: 'Move away', color: '#d9785b' },
  flight: { label: 'Fly', color: '#e8e1cf' },
  optomotor: { label: 'Follow stripes', color: '#93b85a' },
  sleep: { label: 'Sleep', color: '#33415a' },
  held: { label: 'Held', color: '#c96f9e' },
}
export const BEHAVIOUR_ORDER = ['walk', 'stop', 'approach', 'feed', 'drink', 'groom', 'avoid', 'flight', 'optomotor', 'sleep', 'held']
