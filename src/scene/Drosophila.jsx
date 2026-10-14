// Procedural Drosophila melanogaster (adult female), modelled in millimetres.
//
// Body frame: +X anterior, +Y dorsal, +Z the fly's right. The root sits at
// the thorax centre. Proportions follow standard adult measurements:
// ~2.6 mm body length, ~2.2 mm wing length, head ~0.85 mm wide.
//
// Legs are solved with two-bone IK onto feet that stay planted in world
// space and step in an alternating tripod (L1 R2 L3 / R1 L2 R3). Wings fold
// over the abdomen at rest and are drawn as a stroke-plane blur in flight,
// which is how a ~200 Hz wingbeat appears on camera.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim, useStore } from '../store'
import { setWingbeat } from '../audio/audio'
import {
  eyeTextures, cuticleTexture, microBump, abdomenTexture, wingTexture, wingPoints, wingUV,
} from './textures'

export const flyAnchor = new THREE.Vector3()

const BODY_H = 0.5 // thorax centre above the substrate when standing
const UP = new THREE.Vector3(0, 1, 0)

// ------------------------------------------------------------------ legs

// Order: L1 L2 L3 R1 R2 R3. side: -1 left (-Z), +1 right (+Z).
const LEGS = [
  { side: -1, hip: [0.27, -0.24, 0.11], rest: [1.12, 0.72], seg: [0.5, 0.45, 0.48] },
  { side: -1, hip: [0.06, -0.27, 0.13], rest: [0.12, 1.18], seg: [0.53, 0.52, 0.52] },
  { side: -1, hip: [-0.15, -0.25, 0.12], rest: [-1.05, 0.95], seg: [0.56, 0.56, 0.52] },
  { side: 1, hip: [0.27, -0.24, 0.11], rest: [1.12, 0.72], seg: [0.5, 0.45, 0.48] },
  { side: 1, hip: [0.06, -0.27, 0.13], rest: [0.12, 1.18], seg: [0.53, 0.52, 0.52] },
  { side: 1, hip: [-0.15, -0.25, 0.12], rest: [-1.05, 0.95], seg: [0.56, 0.56, 0.52] },
]
// Tripod groups: L1 L3 R2 -> 0, L2 R1 R3 -> 1.
const TRIPOD = [0, 1, 0, 1, 0, 1]

function segmentGeometry(r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 7, 1)
  g.translate(0, 0.5, 0)
  return g
}

const tmpDir = new THREE.Vector3()
function placeSegment(mesh, a, b) {
  tmpDir.subVectors(b, a)
  const len = tmpDir.length()
  mesh.position.copy(a)
  mesh.quaternion.setFromUnitVectors(UP, tmpDir.multiplyScalar(1 / (len || 1)))
  mesh.scale.set(1, len, 1)
}

const _d = new THREE.Vector3()
const _p = new THREE.Vector3()
function solveKnee(hip, ankle, l1, l2, pole, out) {
  _d.subVectors(ankle, hip)
  let d = _d.length()
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
  _d.normalize()
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize()
  out.copy(hip).addScaledVector(_d, a).addScaledVector(_p, h)
  // If the ankle was out of reach, pull it in along the line.
  return d
}

// ------------------------------------------------------------- geometries

function latheAlongX(profile, segments = 40) {
  const pts = profile.map(([t, r]) => new THREE.Vector2(r, t))
  const g = new THREE.LatheGeometry(pts, segments)
  g.rotateZ(Math.PI / 2) // lathe axis +Y -> -X, dorsal at u = 0.25
  return g
}

function abdomenGeometry() {
  const L = 1.5
  const prof = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    let r = 0.27 + 0.25 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08)), 0.75)
    r *= 1 - 0.85 * Math.pow(Math.max(0, t - 0.62) / 0.38, 2.2)
    // Faint intersegmental grooves.
    const seg = (t * 6.3) % 1
    r *= 1 - 0.03 * Math.exp(-((seg - 0.98) ** 2) / 0.002)
    prof.push([t * L, Math.max(0.015, r)])
  }
  prof[0][1] = 0.001
  prof.unshift([0, 0])
  return latheAlongX(prof, 48)
}

function thoraxGeometry() {
  const L = 1.1
  const prof = []
  for (let i = 0; i <= 32; i++) {
    const t = i / 32
    const r = 0.44 * Math.pow(Math.sin(Math.PI * t), 0.62) * (1 - 0.12 * t)
    prof.push([t * L, Math.max(0.001, r)])
  }
  const g = latheAlongX(prof, 40)
  g.translate(L / 2, 0, 0) // centre on the origin
  return g
}

function wingGeometry() {
  const pts = wingPoints(120)
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ShapeGeometry(shape, 24)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = wingUV(pos.getX(i), pos.getY(i))
    uv.setXY(i, u, v)
    // Slight camber so highlights move across the membrane.
    pos.setZ(i, 0.04 * Math.sin(Math.PI * Math.min(1, pos.getX(i) / 2.2)) * (1 - Math.abs(pos.getY(i))))
  }
  g.computeVertexNormals()
  // Map wing space to the hinge frame: span -> -X, leading edge -> +Z, normal -> +Y.
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
  return g
}

// Stroke-plane blur: a fan between the stroke extremes, in the hinge frame.
function strokeFanGeometry(psi0, psi1, r0 = 0.2, r1 = 2.15, n = 28) {
  const pos = []
  const idx = []
  for (let i = 0; i <= n; i++) {
    const psi = psi0 + ((psi1 - psi0) * i) / n
    const dx = -Math.cos(psi)
    const dz = Math.sin(psi)
    pos.push(dx * r0, 0, dz * r0, dx * r1, 0, dz * r1)
    if (i < n) {
      const k = i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Macrochaetae: [position, direction, length]. Mirrored for the right side.
const BRISTLES = [
  [[0.28, 0.43, 0.12], [-1, 0.45, 0.05], 0.3], // anterior dorsocentral
  [[-0.05, 0.44, 0.12], [-1, 0.4, 0.05], 0.34], // posterior dorsocentral
  [[0.42, 0.28, 0.33], [-0.6, 0.5, 0.6], 0.22], // humeral
  [[0.15, 0.3, 0.4], [-0.8, 0.4, 0.5], 0.26], // notopleural
  [[-0.2, 0.35, 0.34], [-0.9, 0.4, 0.35], 0.3], // supra-alar
  [[-0.5, 0.5, 0.08], [-1, 0.25, -0.15], 0.42], // apical scutellar
  [[-0.43, 0.48, 0.17], [-1, 0.3, 0.2], 0.3], // basal scutellar
  [[0.72, 0.4, 0.17], [-0.6, 0.8, 0.25], 0.22], // vertical (head)
  [[0.82, 0.38, 0.13], [0.3, 0.9, 0.2], 0.17], // orbital
  [[0.76, 0.42, 0.035], [0.6, 0.8, 0.15], 0.16], // ocellar
]

// --------------------------------------------------------------- materials

function useFlyMaterials() {
  return useMemo(() => {
    const bump = microBump()
    const eye = eyeTextures()
    const cuticle = new THREE.MeshPhysicalMaterial({
      map: cuticleTexture('#8a6a46', '#5b432c', 3),
      bumpMap: bump,
      bumpScale: 0.6,
      roughness: 0.62,
      clearcoat: 0.25,
      clearcoatRoughness: 0.45,
      sheen: 0.45,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#8f7350'),
    })
    const head = new THREE.MeshPhysicalMaterial({
      map: cuticleTexture('#a4672f', '#7a4a22', 4),
      bumpMap: bump,
      bumpScale: 0.6,
      roughness: 0.55,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
      sheen: 0.35,
      sheenColor: new THREE.Color('#9a6a3e'),
    })
    const abdomen = new THREE.MeshPhysicalMaterial({
      map: abdomenTexture(),
      bumpMap: bump,
      bumpScale: 0.5,
      roughness: 0.5,
      clearcoat: 0.45,
      clearcoatRoughness: 0.35,
      sheen: 0.3,
      sheenColor: new THREE.Color('#8a7350'),
    })
    const eyeMat = new THREE.MeshPhysicalMaterial({
      map: eye.map,
      bumpMap: eye.bump,
      bumpScale: 1.2,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
    })
    // Deep pseudopupil: ommatidia aligned with the viewer absorb light, so a
    // dark spot follows the camera across the eye.
    eyeMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float facing = dot(normalize(normal), normalize(vViewPosition));
         outgoingLight *= 1.0 - 0.78 * smoothstep(0.84, 0.985, facing);
         #include <opaque_fragment>`
      )
    }
    const leg = new THREE.MeshPhysicalMaterial({
      color: '#6e5032',
      roughness: 0.55,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#3a2a1a'),
      clearcoat: 0.2,
    })
    const antenna = new THREE.MeshPhysicalMaterial({ color: '#7a5634', roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#c9a77a') })
    const dark = new THREE.MeshStandardMaterial({ color: '#140d08', roughness: 0.35, metalness: 0.05 })
    const ocellus = new THREE.MeshPhysicalMaterial({ color: '#6d2a14', roughness: 0.1, clearcoat: 1 })
    const labellum = new THREE.MeshPhysicalMaterial({ color: '#c3a170', roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#fff2d0') })
    const haltere = new THREE.MeshPhysicalMaterial({ color: '#cdb795', roughness: 0.5 })
    const wing = new THREE.MeshPhysicalMaterial({
      map: wingTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.12,
      metalness: 0,
      iridescence: 1,
      iridescenceIOR: 1.33,
      iridescenceThicknessRange: [260, 720],
      specularIntensity: 1,
      envMapIntensity: 1.4,
    })
    const blur = new THREE.MeshPhysicalMaterial({
      color: '#b9c4c9',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.3,
      iridescence: 0.6,
      iridescenceThicknessRange: [300, 600],
    })
    return { cuticle, head, abdomen, eye: eyeMat, antenna, leg, dark, ocellus, labellum, haltere, wing, blur }
  }, [])
}

// ------------------------------------------------------------- component

export default function Drosophila() {
  const M = useFlyMaterials()
  const geo = useMemo(() => {
    const b = new THREE.ConeGeometry(0.5, 1, 5, 1)
    b.translate(0, 0.5, 0)
    return {
      abdomen: abdomenGeometry(),
      thorax: thoraxGeometry(),
      wing: wingGeometry(),
      fan: strokeFanGeometry(0.35, 2.5),
      femur: segmentGeometry(0.042, 0.036),
      tibia: segmentGeometry(0.03, 0.026),
      tarsus: segmentGeometry(0.022, 0.012),
      joint: new THREE.SphereGeometry(1, 10, 8),
      bristle: b,
      sphere: new THREE.SphereGeometry(1, 40, 28),
      small: new THREE.SphereGeometry(1, 12, 10),
    }
  }, [])

  const root = useRef()
  const body = useRef()
  const head = useRef()
  const abd = useRef()
  const prob = useRef()
  const labellumRef = useRef()
  const wingYaw = [useRef(), useRef()]
  const wingElev = [useRef(), useRef()]
  const wingMesh = [useRef(), useRef()]
  const fans = [useRef(), useRef()]
  const halteres = [useRef(), useRef()]
  const bristles = useRef()
  const legMeshes = useRef(LEGS.map(() => ({})))

  // Gait state lives in a ref; it is purely visual.
  const gait = useRef(null)
  if (!gait.current) {
    gait.current = {
      feet: LEGS.map(() => new THREE.Vector3()),
      from: LEGS.map(() => new THREE.Vector3()),
      to: LEGS.map(() => new THREE.Vector3()),
      swing: LEGS.map(() => -1),
      init: false,
      lastX: 0,
      lastZ: 0,
      vx: 0,
      vz: 0,
      wingOpen: 0,
      flap: 0,
      bodyH: BODY_H,
      pitch: 0,
      roll: 0,
    }
  }

  const bristleSetup = useRef(false)
  const setupBristles = (mesh) => {
    bristles.current = mesh
    if (!mesh || bristleSetup.current) return
    bristleSetup.current = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    let i = 0
    for (const [pos, dir, len] of BRISTLES) {
      for (const side of [-1, 1]) {
        p.set(pos[0], pos[1], pos[2] * side)
        q.setFromUnitVectors(UP, new THREE.Vector3(dir[0], dir[1], dir[2] * side).normalize())
        s.set(0.024, len, 0.024)
        m.compose(p, q, s)
        mesh.setMatrixAt(i++, m)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  const tmp = useMemo(
    () => ({
      hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), foot: new THREE.Vector3(),
      pole: new THREE.Vector3(), out: new THREE.Vector3(), rest: new THREE.Vector3(),
    }),
    []
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const f = sim.fly
    const g = gait.current
    const t = state.clock.elapsedTime
    const b = f.behaviour
    const flying = b === 'flight' && f.y > 0.02
    const held = !!f.held
    // In the air (flying or carried): legs leave the floor.
    const airborne = flying || held
    const asleep = b === 'sleep'
    const groomFront = b === 'groom' && f.groom === 'front'
    const groomHind = b === 'groom' && f.groom === 'hind'
    const h = f.heading
    const cos = Math.cos(h)
    const sin = Math.sin(h)

    // --- body placement
    const targetH = asleep ? 0.4 : groomHind ? 0.45 : BODY_H
    g.bodyH += (targetH - g.bodyH) * Math.min(1, dt * 4)
    const walkBob = f.speed > 0.5 && !airborne ? Math.sin(t * 48) * 0.008 : 0
    const y = g.bodyH + f.y + walkBob
    root.current.position.set(f.x, y, f.z)
    root.current.rotation.y = -h
    flyAnchor.set(f.x, y, f.z)

    const targetPitch = flying ? 0.22 : held ? 0.1 + Math.sin(t * 7) * 0.04 : groomHind ? 0.12 : groomFront ? -0.08 : 0
    g.pitch += (targetPitch - g.pitch) * Math.min(1, dt * 6)
    const targetRoll = THREE.MathUtils.clamp(-f.angular * 0.03, -0.2, 0.2) * (flying ? 3 : 1)
    g.roll += (targetRoll - g.roll) * Math.min(1, dt * 6)
    body.current.rotation.set(g.roll, 0, g.pitch)

    // --- head
    const headYaw = groomFront ? Math.sin(t * 6) * 0.2 : THREE.MathUtils.clamp(-f.angular * 0.06, -0.3, 0.3)
    const headPitch = asleep ? -0.18 : groomFront ? -0.15 + Math.sin(t * 12) * 0.08 : b === 'feed' || b === 'drink' ? -0.12 : 0
    head.current.rotation.y += (headYaw - head.current.rotation.y) * Math.min(1, dt * 8)
    head.current.rotation.z += (headPitch - head.current.rotation.z) * Math.min(1, dt * 6)

    // --- proboscis
    const per = f.per
    const pump = b === 'feed' || b === 'drink' ? Math.sin(t * 26) * 0.06 * per : 0
    // Folded down-and-back at rest, swung forward and down when extended.
    prob.current.rotation.z = Math.PI - 0.55 + 0.9 * per
    prob.current.scale.set(1, 0.08 + 0.4 * per + pump, 1)
    labellumRef.current.scale.setScalar(0.2 + 1.0 * per)

    // --- abdomen breathing / pumping
    const breath = 1 + Math.sin(t * (asleep ? 1.2 : 2.4)) * 0.012
    abd.current.scale.set(1, breath, breath)
    abd.current.rotation.z = -0.1 + (groomHind ? 0.12 * Math.sin(t * 7) : 0) + (asleep ? -0.05 : 0)

    // --- wings
    const wantOpen = flying ? 1 : 0
    g.wingOpen += (wantOpen - g.wingOpen) * Math.min(1, dt * (wantOpen ? 18 : 7))
    const groomLift = groomHind ? 0.5 + 0.5 * Math.sin(t * 7) : 0
    for (let s = 0; s < 2; s++) {
      const yaw = THREE.MathUtils.lerp(0.13 + groomLift * 0.35, 1.45, g.wingOpen)
      wingYaw[s].current.rotation.y = yaw
      wingElev[s].current.rotation.z = 0.07 - groomLift * 0.3 - g.wingOpen * 0.17
      wingElev[s].current.rotation.x = 0.04
      wingMesh[s].current.visible = g.wingOpen < 0.9
      M.blur.opacity = 0.3 * g.wingOpen
      fans[s].current.visible = g.wingOpen > 0.3
      halteres[s].current.rotation.x = flying ? Math.sin(t * 90) * 0.6 : 0
    }
    setWingbeat(flying ? 1 : 0, 1 + Math.min(0.15, f.speed / 400))

    // --- legs
    const world = (lx, lz, out) => out.set(f.x + lx * cos - lz * sin, 0, f.z + lx * sin + lz * cos)
    const toLocal = (wv, out) => {
      const dx = wv.x - f.x
      const dz = wv.z - f.z
      return out.set(dx * cos + dz * sin, wv.y - y, -dx * sin + dz * cos)
    }
    if (!g.init) {
      LEGS.forEach((L, i) => world(L.rest[0], L.rest[1] * L.side, g.feet[i]))
      g.init = true
    }
    const vx = (f.x - g.lastX) / Math.max(dt, 1e-3)
    const vz = (f.z - g.lastZ) / Math.max(dt, 1e-3)
    g.lastX = f.x
    g.lastZ = f.z
    const speed = Math.hypot(vx, vz)
    const swingDur = THREE.MathUtils.clamp(0.1 - speed * 0.003, 0.05, 0.1)
    const threshold = THREE.MathUtils.clamp(0.25 + speed * 0.03, 0.25, 0.7)
    const lead = Math.min(0.08, threshold * 0.08)

    const overridden = (i) => airborne || (groomFront && (i === 0 || i === 3)) || (groomHind && (i === 2 || i === 5))

    // Decide which tripod steps.
    if (!airborne) {
      const swinging = [false, false]
      let need = [0, 0]
      LEGS.forEach((L, i) => {
        if (g.swing[i] >= 0) swinging[TRIPOD[i]] = true
        if (overridden(i)) return
        world(L.rest[0] + vx * lead * cos + vz * lead * sin, L.rest[1] * L.side + (-vx * sin + vz * cos) * lead, tmp.rest)
        const err = Math.hypot(tmp.rest.x - g.feet[i].x, tmp.rest.z - g.feet[i].z)
        need[TRIPOD[i]] = Math.max(need[TRIPOD[i]], err)
      })
      for (const grp of [0, 1]) {
        const other = 1 - grp
        const settle = speed < 0.2 && need[grp] > 0.12
        if (!swinging[grp] && !swinging[other] && (need[grp] > threshold || settle) && need[grp] >= need[other] * 0.8) {
          LEGS.forEach((L, i) => {
            if (TRIPOD[i] !== grp || overridden(i)) return
            g.from[i].copy(g.feet[i])
            world(L.rest[0] + vx * swingDur * 1.2 * cos + vz * swingDur * 1.2 * sin, L.rest[1] * L.side + (-vx * sin + vz * cos) * swingDur * 1.2, g.to[i])
            g.swing[i] = 0
          })
          break
        }
      }
    }

    LEGS.forEach((L, i) => {
      const mesh = legMeshes.current[i]
      if (!mesh.femur) return
      tmp.hip.set(L.hip[0], L.hip[1], L.hip[2] * L.side)
      let lift = 0
      if (g.swing[i] >= 0) {
        g.swing[i] += dt / swingDur
        const u = Math.min(1, g.swing[i])
        g.feet[i].lerpVectors(g.from[i], g.to[i], u)
        lift = Math.sin(Math.PI * u) * 0.16
        if (u >= 1) g.swing[i] = -1
      }
      if (airborne) {
        // Legs hang under the body in flight; a held fly kicks them.
        const dangle = [[0.45, -0.55, 0.28], [0.05, -0.62, 0.32], [-0.45, -0.58, 0.3]][i % 3]
        const kick = held ? Math.sin(t * 16 + i * 1.9) * 0.18 : 0
        tmp.foot.set(dangle[0] + kick, dangle[1] + Math.abs(kick) * 0.4, (dangle[2] + (held ? 0.25 : 0)) * L.side)
        world(L.rest[0], L.rest[1] * L.side, g.feet[i]) // re-plant on landing
        g.swing[i] = -1
      } else if (overridden(i)) {
        if (i === 0 || i === 3) {
          // Foreleg rubbing in front of the head.
          const ph = t * 14 + (L.side > 0 ? Math.PI : 0)
          tmp.foot.set(1.05 + Math.sin(ph) * 0.12, -0.05 + Math.cos(ph) * 0.1, 0.06 * L.side + Math.sin(ph) * 0.05)
        } else {
          // Hind legs sweeping over the wings and abdomen.
          const ph = t * 9 + (L.side > 0 ? Math.PI : 0)
          tmp.foot.set(-1.2 + Math.sin(ph) * 0.35, 0.05 + Math.max(0, Math.cos(ph)) * 0.3, 0.42 * L.side)
        }
        world(L.rest[0], L.rest[1] * L.side, g.feet[i])
      } else {
        toLocal(g.feet[i], tmp.foot)
        tmp.foot.y += lift
      }

      // Tarsus lies along the substrate, pointing away from the hip.
      tmp.out.set(tmp.foot.x - tmp.hip.x, 0, tmp.foot.z - tmp.hip.z).normalize()
      const tarsLen = L.seg[2]
      const onGround = !airborne && !overridden(i)
      tmp.ankle.copy(tmp.foot).addScaledVector(tmp.out, -tarsLen * (onGround ? 0.9 : 0.6))
      tmp.ankle.y += onGround ? 0.16 : 0.12
      tmp.pole.set(tmp.out.x * 0.4, 1, tmp.out.z * 0.4 + 0.6 * L.side)
      solveKnee(tmp.hip, tmp.ankle, L.seg[0], L.seg[1], tmp.pole, tmp.knee)
      // Recompute the ankle reachable from the knee.
      _d.subVectors(tmp.ankle, tmp.knee).normalize()
      tmp.ankle.copy(tmp.knee).addScaledVector(_d, L.seg[1])
      placeSegment(mesh.femur, tmp.hip, tmp.knee)
      placeSegment(mesh.tibia, tmp.knee, tmp.ankle)
      placeSegment(mesh.tarsus, tmp.ankle, tmp.foot)
      mesh.knee.position.copy(tmp.knee)
      mesh.ankle.position.copy(tmp.ankle)
    })

  })

  const onClick = (e) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.tool || st.hand) return
    sim.touchFly()
  }

  return (
    <group ref={root}>
      {/* generous invisible hit volume so the fly is easy to touch */}
      <mesh onClick={onClick} visible={false}>
        <sphereGeometry args={[1.6, 8, 6]} />
      </mesh>

      <group ref={body}>
        {/* thorax */}
        <mesh geometry={geo.thorax} material={M.cuticle} position={[0.08, 0.06, 0]} rotation={[0, 0, -0.08]} scale={[1, 1, 0.95]} castShadow />
        {/* scutellum */}
        <mesh geometry={geo.sphere} material={M.cuticle} position={[-0.43, 0.36, 0]} scale={[0.17, 0.1, 0.2]} castShadow />
        {/* neck */}
        <mesh geometry={geo.sphere} material={M.cuticle} position={[0.62, 0.06, 0]} scale={[0.12, 0.14, 0.14]} />

        {/* head */}
        <group ref={head} position={[0.74, 0.12, 0]}>
          <mesh geometry={geo.sphere} material={M.head} position={[0.06, 0, 0]} scale={[0.21, 0.29, 0.35]} castShadow />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.sphere} material={M.eye} position={[0.05, 0.02, 0.27 * s]} rotation={[0.15 * s, -0.25 * s, 0]} scale={[0.25, 0.31, 0.155]} castShadow />
          ))}
          {/* ocelli triangle on the vertex */}
          {[[0.06, 0.3, 0], [0.0, 0.29, 0.045], [0.0, 0.29, -0.045]].map((p, i) => (
            <mesh key={i} geometry={geo.small} material={M.ocellus} position={p} scale={0.022} />
          ))}
          {/* antennae: scape/pedicel, funiculus, plumose arista */}
          {[-1, 1].map((s) => (
            <group key={s} position={[0.27, 0.06, 0.06 * s]} rotation={[0.25 * s, 0, -0.5]}>
              <mesh geometry={geo.small} material={M.head} scale={[0.05, 0.04, 0.04]} />
              <mesh geometry={geo.small} material={M.antenna} position={[0.03, -0.1, 0.01 * s]} scale={[0.06, 0.11, 0.045]} castShadow />
              <group position={[0.05, -0.05, 0.03 * s]} rotation={[-0.5 * s, 0.3 * s, -1.2]}>
                <mesh geometry={geo.bristle} material={M.dark} scale={[0.012, 0.36, 0.012]} />
                {[0.1, 0.15, 0.2, 0.25, 0.3].map((p, k) => (
                  <mesh key={k} geometry={geo.bristle} material={M.dark} position={[0, p, 0]} rotation={[0, 0, k % 2 ? 0.9 : -0.9]} scale={[0.006, 0.07, 0.006]} />
                ))}
              </group>
            </group>
          ))}
          {/* proboscis with labellum */}
          <group position={[0.12, -0.2, 0]}>
            <group ref={prob} rotation={[0, 0, Math.PI - 0.55]}>
              <mesh geometry={geo.femur} material={M.labellum} scale={[1.7, 0.42, 1.7]} />
            </group>
            <ProboscisTip probRef={prob} labellumRef={labellumRef} material={M.labellum} geometry={geo.small} />
          </group>
        </group>

        {/* abdomen */}
        <group ref={abd} position={[-0.38, 0.02, 0]} rotation={[0, 0, -0.1]}>
          <mesh geometry={geo.abdomen} material={M.abdomen} scale={[1, 0.86, 1]} castShadow />
        </group>

        {/* wings and halteres; the left side is mirrored */}
        {[0, 1].map((s) => (
          <group key={s} scale={[1, 1, s === 0 ? -1 : 1]}>
            <group position={[0.0, 0.45, 0.16]}>
              <group ref={wingYaw[s]}>
                <group ref={wingElev[s]}>
                  <mesh ref={wingMesh[s]} geometry={geo.wing} material={M.wing} castShadow renderOrder={2} />
                </group>
              </group>
              <mesh ref={fans[s]} geometry={geo.fan} material={M.blur} visible={false} renderOrder={3} />
            </group>
            <group ref={halteres[s]} position={[-0.3, 0.18, 0.3]}>
              <mesh geometry={geo.tarsus} material={M.haltere} rotation={[0.9, 0, 0.6]} scale={[1, 0.22, 1]} />
              <mesh geometry={geo.small} material={M.haltere} position={[-0.11, 0.06, 0.14]} scale={0.05} />
            </group>
          </group>
        ))}

        <instancedMesh ref={setupBristles} args={[geo.bristle, M.dark, BRISTLES.length * 2]} castShadow />
      </group>

      {/* legs are attached to the root (IK runs in root space) */}
      {LEGS.map((L, i) => (
        <group key={i}>
          <mesh ref={(m) => (legMeshes.current[i].femur = m)} geometry={geo.femur} material={M.leg} castShadow />
          <mesh ref={(m) => (legMeshes.current[i].tibia = m)} geometry={geo.tibia} material={M.leg} castShadow />
          <mesh ref={(m) => (legMeshes.current[i].tarsus = m)} geometry={geo.tarsus} material={M.leg} castShadow />
          <mesh ref={(m) => (legMeshes.current[i].knee = m)} geometry={geo.joint} material={M.leg} scale={0.038} />
          <mesh ref={(m) => (legMeshes.current[i].ankle = m)} geometry={geo.joint} material={M.leg} scale={0.027} />
          <mesh geometry={geo.joint} material={M.cuticle} position={[L.hip[0], L.hip[1], L.hip[2] * L.side]} scale={[0.07, 0.06, 0.06]} />
        </group>
      ))}
    </group>
  )
}

// Keeps the labellum at the tip of the (scaled) proboscis.
function ProboscisTip({ probRef, labellumRef, material, geometry }) {
  const tip = useRef()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const p = probRef.current
    if (!p || !tip.current) return
    v.set(0, 1, 0).applyEuler(p.rotation).multiplyScalar(p.scale.y)
    tip.current.position.copy(v)
  })
  return (
    <group ref={tip}>
      <group ref={labellumRef}>
        {/* two labellar lobes */}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geometry} material={material} position={[0.012, -0.01, 0.035 * s]} scale={[0.06, 0.04, 0.05]} />
        ))}
      </group>
    </group>
  )
}
