// Synthesised sound, no audio files. Kept deliberately quiet and sparse:
// lab equipment clicks, a pneumatic valve for the air puff, an incubator
// fan bed, and the ~200 Hz wingbeat tone during flight.

let ctx = null
let master = null
let buzz = null
let muted = false

function ensure() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function noiseBuffer(c, seconds, brown = false) {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

function burst({ dur = 0.2, freq = 2000, q = 0.8, type = 'bandpass', peak = 0.3, attack = 0.005 }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, dur + 0.05)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.05)
}

function ping(freq, dur = 0.08, peak = 0.12, type = 'sine') {
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

const SFX = {
  place: () => { ping(2400, 0.06, 0.08); burst({ dur: 0.05, freq: 4000, peak: 0.08 }) },
  remove: () => burst({ dur: 0.16, freq: 3200, q: 0.6, peak: 0.12 }),
  puff: () => { ping(900, 0.02, 0.1, 'square'); burst({ dur: 0.32, freq: 1400, q: 0.4, peak: 0.28, attack: 0.01 }) },
  loom: () => ping(180, 0.12, 0.08),
  toggle: () => { ping(1600, 0.025, 0.08, 'square'); ping(1100, 0.02, 0.05, 'square') },
  touch: () => burst({ dur: 0.12, freq: 6000, q: 0.5, peak: 0.07 }),
  takeoff: () => {},
  ui: () => ping(1800, 0.03, 0.04),
}

export function playSfx(name) {
  SFX[name]?.()
}

export function startAudio() {
  const c = ensure()
  if (!c || buzz) return
  // Incubator fan bed.
  const fan = c.createBufferSource()
  fan.buffer = noiseBuffer(c, 4, true)
  fan.loop = true
  const fanF = c.createBiquadFilter()
  fanF.type = 'lowpass'
  fanF.frequency.value = 380
  const fanG = c.createGain()
  fanG.gain.value = 0.05
  fan.connect(fanF).connect(fanG).connect(master)
  fan.start()

  // Wingbeat: sawtooth near 200 Hz shaped by a resonant band-pass.
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = 205
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 420
  f.Q.value = 1.4
  const g = c.createGain()
  g.gain.value = 0
  o.connect(f).connect(g).connect(master)
  o.start()
  buzz = { o, g }
}

export function setWingbeat(level, pitch = 1) {
  if (!ctx || !buzz) return
  const t = ctx.currentTime
  buzz.g.gain.setTargetAtTime(level * 0.16, t, 0.03)
  buzz.o.frequency.setTargetAtTime(205 * pitch, t, 0.05)
}

export function setMuted(next) {
  muted = next
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05)
}
