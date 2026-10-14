import { DAY_LENGTH_S, LIGHTS_OFF_ZT, LIGHTS_ON_ZT } from './config'

// Behaviour runs in real time; the light:dark cycle is compressed so that a
// full 12:12 LD day passes in DAY_LENGTH_S real seconds.
export const ZT_HOURS_PER_SECOND = 24 / DAY_LENGTH_S

export function advanceZT(zt, dt) {
  return (zt + dt * ZT_HOURS_PER_SECOND) % 24
}

export function isPhotophase(zt) {
  return zt >= LIGHTS_ON_ZT && zt < LIGHTS_OFF_ZT
}

// Circular distance between two times of day, in hours.
export function ztDistance(a, b) {
  const d = Math.abs(a - b) % 24
  return d > 12 ? 24 - d : d
}

// Scheduled illumination with a short ramp at dawn and dusk (0..1).
export function scheduledLight(zt) {
  const ramp = 0.35
  if (zt < LIGHTS_ON_ZT + ramp) return Math.max(0, (zt - LIGHTS_ON_ZT) / ramp)
  if (zt < LIGHTS_OFF_ZT) return 1
  if (zt < LIGHTS_OFF_ZT + ramp) return 1 - (zt - LIGHTS_OFF_ZT) / ramp
  return 0
}

// Bimodal locomotor drive. Drosophila under LD show morning and evening
// activity peaks that anticipate the light transitions, with a midday
// siesta and consolidated night sleep.
export function circadianActivity(zt) {
  const morning = Math.exp(-((ztDistance(zt, 0.6) / 1.6) ** 2))
  const evening = Math.exp(-((ztDistance(zt, 11.4) / 1.6) ** 2))
  return Math.min(1, 0.3 + 0.7 * Math.max(morning, evening))
}

export function siestaDrive(zt) {
  return Math.exp(-((ztDistance(zt, 6.5) / 1.4) ** 2))
}

export function formatZT(zt) {
  const h = Math.floor(zt)
  const m = Math.floor((zt - h) * 60)
  return `ZT${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = String(m).padStart(2, '0')
  const sss = String(ss).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`
}

// Clock time for display. Lights come on at 06:00 (ZT0) and go off at 18:00.
export function formatTimeOfDay(zt) {
  const t = (zt + 6) % 24
  const h = Math.floor(t)
  const m = Math.floor((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
