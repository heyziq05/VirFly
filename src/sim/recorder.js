import { BEHAVIOUR_ORDER } from './config'

// Fixed-size ring buffers for tracking data, sampled at RATE_HZ.
// Kept outside React: the canvas views read them directly.

export const RATE_HZ = 10
const CAPACITY = RATE_HZ * 60 * 30 // 30 minutes

const BEHAVIOUR_CODE = Object.fromEntries(BEHAVIOUR_ORDER.map((b, i) => [b, i]))

export function createRecorder() {
  const t = new Float64Array(CAPACITY)
  const x = new Float32Array(CAPACITY)
  const z = new Float32Array(CAPACITY)
  const y = new Float32Array(CAPACITY)
  const heading = new Float32Array(CAPACITY)
  const speed = new Float32Array(CAPACITY)
  const behaviour = new Uint8Array(CAPACITY)
  const budget = new Float64Array(BEHAVIOUR_ORDER.length)
  let head = 0
  let count = 0
  let acc = 0
  let distance = 0
  let lastX = null
  let lastZ = null

  function sample(now, fly, dt) {
    budget[BEHAVIOUR_CODE[fly.behaviour] ?? 0] += dt
    acc += dt
    if (acc < 1 / RATE_HZ) return
    acc -= 1 / RATE_HZ
    if (lastX !== null && fly.y < 0.05) distance += Math.hypot(fly.x - lastX, fly.z - lastZ)
    lastX = fly.x
    lastZ = fly.z
    t[head] = now
    x[head] = fly.x
    z[head] = fly.z
    y[head] = fly.y
    heading[head] = fly.heading
    speed[head] = fly.speed
    behaviour[head] = BEHAVIOUR_CODE[fly.behaviour] ?? 0
    head = (head + 1) % CAPACITY
    count = Math.min(CAPACITY, count + 1)
  }

  // Calls fn(i, k) for the last n samples, oldest first. i indexes the
  // buffers, k counts from 0.
  function forEachRecent(n, fn) {
    const m = Math.min(n, count)
    const start = (head - m + CAPACITY) % CAPACITY
    for (let k = 0; k < m; k++) fn((start + k) % CAPACITY, k, m)
    return m
  }

  function toCSV(zt0Of) {
    const rows = ['t_s,zt_h,x_mm,y_mm,z_mm,heading_rad,speed_mm_s,behaviour']
    forEachRecent(count, (i) => {
      rows.push(
        [
          t[i].toFixed(2),
          zt0Of(t[i]).toFixed(3),
          x[i].toFixed(3),
          z[i].toFixed(3),
          y[i].toFixed(3),
          heading[i].toFixed(3),
          speed[i].toFixed(2),
          BEHAVIOUR_ORDER[behaviour[i]],
        ].join(',')
      )
    })
    return rows.join('\n')
  }

  return {
    t, x, z, y, heading, speed, behaviour, budget,
    sample,
    forEachRecent,
    toCSV,
    get count() { return count },
    get distance() { return distance },
    get latest() { return count ? (head - 1 + CAPACITY) % CAPACITY : -1 },
  }
}
