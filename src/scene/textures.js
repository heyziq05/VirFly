// Procedural canvas textures. Generated once at start-up; no image assets.
import * as THREE from 'three'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function tex(c, { repeat = [1, 1], srgb = true, wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = wrap
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Deterministic PRNG so textures look the same on every load.
function mulberry(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function speckle(ctx, w, h, n, rnd, colors, size = [0.5, 1.5], alpha = [0.05, 0.2]) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha[0] + rnd() * (alpha[1] - alpha[0])
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]
    const r = size[0] + rnd() * (size[1] - size[0])
    ctx.beginPath()
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

const cache = {}
const once = (key, fn) => cache[key] || (cache[key] = fn())

// ---------------------------------------------------------------- the fly

// Compound eye: hexagonal facet lattice. Returns colour and bump maps.
export const eyeTextures = () =>
  once('eye', () => {
    const W = 512
    const H = 512
    const [c, ctx] = canvas(W, H)
    const [b, btx] = canvas(W, H)
    const r = 7.5
    const dx = r * Math.sqrt(3)
    const dy = r * 1.5
    ctx.fillStyle = '#5e0b0b'
    ctx.fillRect(0, 0, W, H)
    btx.fillStyle = '#000'
    btx.fillRect(0, 0, W, H)
    const rnd = mulberry(7)
    for (let row = -1; row * dy < H + dy; row++) {
      for (let col = -1; col * dx < W + dx; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0)
        const y = row * dy
        const shade = 0.85 + rnd() * 0.25
        const g = ctx.createRadialGradient(x, y - 1, 0, x, y, r)
        g.addColorStop(0, `rgb(${Math.round(176 * shade)},${Math.round(30 * shade)},${Math.round(24 * shade)})`)
        g.addColorStop(0.75, `rgb(${Math.round(128 * shade)},${Math.round(16 * shade)},${Math.round(14 * shade)})`)
        g.addColorStop(1, '#3a0606')
        ctx.fillStyle = g
        hex(ctx, x, y, r * 0.93)
        const bg = btx.createRadialGradient(x, y, 0, x, y, r)
        bg.addColorStop(0, '#fff')
        bg.addColorStop(0.8, '#999')
        bg.addColorStop(1, '#000')
        btx.fillStyle = bg
        hex(btx, x, y, r * 0.93)
      }
    }
    return { map: tex(c, { repeat: [4, 3] }), bump: tex(b, { repeat: [4, 3], srgb: false }) }
  })

function hex(ctx, x, y, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    const px = x + r * Math.cos(a)
    const py = y + r * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

// Thorax / head cuticle: tan-grey pruinose surface with faint longitudinal
// stripes and microchaetae speckle.
export const cuticleTexture = (base = '#9a7a52', stripe = '#6d5236', seed = 3) =>
  once(`cut${base}${seed}`, () => {
    const [c, ctx] = canvas(512, 256)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 512, 256)
    const rnd = mulberry(seed)
    // Faint longitudinal stripes along the dorsal midline (u = 0.25 on the
    // lathe-built thorax).
    for (const u of [0.2, 0.25, 0.3]) {
      const g = ctx.createLinearGradient(u * 512 - 10, 0, u * 512 + 10, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.5, stripe + '70')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(u * 512 - 10, 0, 20, 256)
    }
    speckle(ctx, 512, 256, 5000, rnd, ['#2a1c10', '#4a3420'], [0.4, 1.0], [0.25, 0.6])
    speckle(ctx, 512, 256, 1200, rnd, ['#d8c4a0'], [0.4, 1.2], [0.05, 0.15])
    return tex(c)
  })

export const microBump = () =>
  once('microBump', () => {
    const [c, ctx] = canvas(256, 256)
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, 256, 256)
    speckle(ctx, 256, 256, 3000, mulberry(11), ['#ffffff', '#000000'], [0.4, 1.1], [0.2, 0.5])
    return tex(c, { srgb: false, repeat: [2, 2] })
  })

// Abdomen: lathe UVs run u around the body and v from base to tip.
// Each tergite has a dark posterior band that fades towards the pale
// ventral sternites. The female tip is lighter with a dark ovipositor.
export const abdomenTexture = () =>
  once('abd', () => {
    const W = 512
    const H = 512
    const [c, ctx] = canvas(W, H)
    ctx.fillStyle = '#c9b48a'
    ctx.fillRect(0, 0, W, H)
    const segs = [
      [0.06, 0.2], [0.2, 0.36], [0.36, 0.52], [0.52, 0.67], [0.67, 0.8], [0.8, 0.9],
    ]
    for (let x = 0; x < W; x++) {
      const u = x / W
      // After the lathe is laid along -X, dorsal is u = 0.25 and ventral
      // u = 0.75. Tergites wrap well down the sides; sternites stay pale.
      const c = Math.cos((u - 0.25) * Math.PI * 2)
      const tergite = Math.min(1, Math.max(0, (c + 0.5) / 0.55))
      for (const [a, bnd] of segs) {
        const y0 = a * H
        const y1 = bnd * H
        // tan anterior part of the tergite
        ctx.fillStyle = `rgba(176,128,70,${0.9 * tergite})`
        ctx.fillRect(x, y0, 1, (y1 - y0) * 0.55)
        // dark posterior band
        ctx.fillStyle = `rgba(48,30,16,${0.95 * tergite})`
        ctx.fillRect(x, y0 + (y1 - y0) * 0.55, 1, (y1 - y0) * 0.45)
      }
      ctx.fillStyle = `rgba(60,38,20,${0.9 * tergite})`
      ctx.fillRect(x, 0.9 * H, 1, 0.1 * H)
    }
    speckle(ctx, W, H, 3500, mulberry(5), ['#1a1008'], [0.4, 0.9], [0.2, 0.45])
    return tex(c, { wrap: THREE.ClampToEdgeWrapping })
  })

// Wing membrane with venation. RGBA: the membrane is nearly clear, the
// veins are brown and opaque. Wing space is in millimetres: x runs along the
// span from the hinge (0) to the tip (WING_LEN), y across the chord with the
// leading edge positive.
export const WING_LEN = 2.2
const CHORD = 0.5 * WING_LEN // y values below are fractions of this
export const WING_Y = [-0.62 * CHORD, 0.42 * CHORD]

const OUTLINE = [
  [0.0, 0.02], [0.08, 0.11], [0.25, 0.25], [0.5, 0.34], [0.75, 0.355], [0.9, 0.29], [0.975, 0.16],
  [1.0, 0.0], [0.975, -0.16], [0.9, -0.33], [0.75, -0.5], [0.55, -0.58], [0.35, -0.52],
  [0.19, -0.36], [0.09, -0.19], [0.03, -0.07],
]

export function wingPoints(n = 160) {
  const curve = new THREE.CatmullRomCurve3(
    OUTLINE.map(([x, y]) => new THREE.Vector3(x * WING_LEN, y * CHORD, 0)),
    true,
    'centripetal'
  )
  return curve.getPoints(n).map((p) => [p.x, p.y])
}

export const wingUV = (x, y) => [x / WING_LEN, (y - WING_Y[0]) / (WING_Y[1] - WING_Y[0])]

export const wingTexture = () =>
  once('wing', () => {
    const W = 1024
    const H = 512
    const [c, ctx] = canvas(W, H)
    const X = (x) => wingUV(x, 0)[0] * W
    const Y = (y) => (1 - wingUV(0, y)[1]) * H
    const outline = wingPoints(240)
    const path = () => {
      ctx.beginPath()
      outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      ctx.closePath()
    }
    path()
    ctx.fillStyle = 'rgba(228,234,236,0.14)'
    ctx.fill()
    ctx.save()
    path()
    ctx.clip()
    speckle(ctx, W, H, 9000, mulberry(9), ['#6a5a4a'], [0.4, 0.8], [0.05, 0.12])
    ctx.strokeStyle = 'rgba(88,64,40,0.95)'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const vein = (pts, w) => {
      ctx.lineWidth = w
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x * WING_LEN), Y(y * CHORD)) : ctx.moveTo(X(x * WING_LEN), Y(y * CHORD))))
      ctx.stroke()
    }
    vein([[0.0, 0.03], [0.08, 0.11], [0.25, 0.245], [0.5, 0.335], [0.75, 0.35], [0.9, 0.285], [0.975, 0.155], [1.0, 0.02]], 8) // costa
    vein([[0.04, 0.03], [0.2, 0.13], [0.32, 0.17]], 4) // L1 / subcosta
    vein([[0.06, 0.02], [0.3, 0.12], [0.6, 0.2], [0.82, 0.24], [0.9, 0.27]], 4) // L2
    vein([[0.06, 0.0], [0.35, 0.02], [0.7, 0.03], [0.995, 0.01]], 4) // L3
    vein([[0.07, -0.04], [0.35, -0.12], [0.65, -0.22], [0.93, -0.34]], 4) // L4
    vein([[0.08, -0.08], [0.28, -0.24], [0.48, -0.38], [0.66, -0.52]], 4) // L5
    vein([[0.12, -0.03], [0.14, -0.18]], 3) // basal cross vein
    vein([[0.4, 0.024], [0.395, -0.135]], 3) // anterior cross vein
    vein([[0.6, -0.235], [0.56, -0.43]], 3.5) // posterior cross vein
    ctx.restore()
    path()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = 'rgba(105,82,58,0.85)'
    ctx.stroke()
    return tex(c, { wrap: THREE.ClampToEdgeWrapping })
  })

// ---------------------------------------------------------------- substrates

export const filterPaperTexture = () =>
  once('paper', () => {
    const [c, ctx] = canvas(1024, 1024)
    ctx.fillStyle = '#e8e5dc'
    ctx.fillRect(0, 0, 1024, 1024)
    const rnd = mulberry(21)
    ctx.lineCap = 'round'
    for (let i = 0; i < 6000; i++) {
      const x = rnd() * 1024
      const y = rnd() * 1024
      const a = rnd() * Math.PI
      const l = 6 + rnd() * 26
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(150,140,120,0.12)'
      ctx.lineWidth = 0.6 + rnd() * 0.9
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
      ctx.stroke()
    }
    speckle(ctx, 1024, 1024, 2500, rnd, ['#a89f8a'], [0.4, 1.0], [0.05, 0.15])
    return tex(c, { repeat: [3, 3] })
  })

export const breadboardTexture = () =>
  once('bread', () => {
    const S = 512
    const [c, ctx] = canvas(S, S)
    ctx.fillStyle = '#17191b'
    ctx.fillRect(0, 0, S, S)
    speckle(ctx, S, S, 6000, mulberry(31), ['#2a2d30', '#0e0f10'], [0.5, 1.4], [0.2, 0.5])
    // One M6 tapped hole per tile (tile = 25 mm).
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.13)
    g.addColorStop(0, '#000')
    g.addColorStop(0.75, '#050505')
    g.addColorStop(0.86, '#3a3d40')
    g.addColorStop(1, '#17191b')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S * 0.13, 0, Math.PI * 2)
    ctx.fill()
    return tex(c, { repeat: [16, 16] })
  })

export const bananaTexture = () =>
  once('banana', () => {
    const S = 512
    const [c, ctx] = canvas(S, S)
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, '#efe2b0')
    g.addColorStop(0.3, '#f4ebc6')
    g.addColorStop(0.86, '#ece0ae')
    g.addColorStop(0.95, '#d9c784')
    g.addColorStop(1, '#a89a50')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    // Three-lobed placental core with seed traces.
    const rnd = mulberry(41)
    ctx.translate(S / 2, S / 2)
    for (let k = 0; k < 3; k++) {
      ctx.rotate((Math.PI * 2) / 3)
      ctx.fillStyle = 'rgba(214,196,130,0.55)'
      ctx.beginPath()
      ctx.ellipse(0, -S * 0.07, S * 0.05, S * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = 'rgba(70,52,30,0.75)'
        ctx.beginPath()
        ctx.arc((rnd() - 0.5) * S * 0.05, -S * (0.03 + rnd() * 0.12), 1.6 + rnd() * 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // Radial fibres
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2
      const r0 = S * (0.15 + rnd() * 0.15)
      const r1 = S * (0.32 + rnd() * 0.14)
      ctx.strokeStyle = 'rgba(200,180,110,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0)
      ctx.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1)
      ctx.stroke()
    }
    return tex(c, { wrap: THREE.ClampToEdgeWrapping })
  })

export const appleTexture = () =>
  once('apple', () => {
    const S = 512
    const [c, ctx] = canvas(S, S)
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, '#efe2bb')
    g.addColorStop(0.9, '#f6efd6')
    g.addColorStop(0.955, '#e9dcae')
    g.addColorStop(0.975, '#b8322a')
    g.addColorStop(1, '#7a1414')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    ctx.translate(S / 2, S / 2)
    // Pentagonal core: five carpels with seeds.
    ctx.strokeStyle = 'rgba(190,170,110,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2
      const r = S * 0.17
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.stroke()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2
      ctx.save()
      ctx.rotate(a + Math.PI / 2)
      ctx.fillStyle = 'rgba(232,218,170,1)'
      ctx.beginPath()
      ctx.ellipse(0, -S * 0.1, S * 0.035, S * 0.07, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(170,150,96,0.7)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      if (i % 2 === 0) {
        ctx.fillStyle = '#4a2a16'
        ctx.beginPath()
        ctx.ellipse(0, -S * 0.1, S * 0.017, S * 0.035, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    // Vascular bundle ring
    ctx.strokeStyle = 'rgba(200,180,120,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, S * 0.27, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    speckle(ctx, S, S, 800, mulberry(43), ['#ffffff'], [0.6, 1.6], [0.1, 0.3])
    return tex(c, { wrap: THREE.ClampToEdgeWrapping })
  })

export const grapeTexture = () =>
  once('grape', () => {
    const S = 512
    const [c, ctx] = canvas(S, S)
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, '#d9e0a6')
    g.addColorStop(0.7, '#c4cf85')
    g.addColorStop(0.93, '#a8b06a')
    g.addColorStop(0.965, '#5b2a4c')
    g.addColorStop(1, '#2c1028')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    for (const [x, y] of [[-0.06, -0.04], [0.07, 0.03]]) {
      ctx.fillStyle = 'rgba(150,120,60,0.9)'
      ctx.beginPath()
      ctx.ellipse(S / 2 + x * S, S / 2 + y * S, S * 0.04, S * 0.065, x * 6, 0, Math.PI * 2)
      ctx.fill()
    }
    speckle(ctx, S, S, 400, mulberry(51), ['#f4f7d8'], [1, 3], [0.1, 0.25])
    return tex(c, { wrap: THREE.ClampToEdgeWrapping })
  })

export const grainBump = () =>
  once('grain', () => {
    const [c, ctx] = canvas(256, 256)
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, 256, 256)
    speckle(ctx, 256, 256, 2600, mulberry(61), ['#ffffff', '#202020'], [0.8, 2.2], [0.2, 0.6])
    return tex(c, { srgb: false, repeat: [2, 2] })
  })

// LED-panel grating for the optomotor drum (green, as in most fly arenas).
export const gratingTexture = () =>
  once('grating', () => {
    const [c, ctx] = canvas(512, 64)
    ctx.fillStyle = '#020302'
    ctx.fillRect(0, 0, 512, 64)
    for (let x = 0; x < 512; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        const on = Math.floor(x / 32) % 2 === 0
        ctx.fillStyle = on ? '#4dff6a' : '#061008'
        ctx.fillRect(x + 0.6, y + 0.6, 2.8, 2.8)
      }
    }
    return tex(c, { repeat: [3, 1] })
  })
