// The rig: optical breadboard, glass dish lined with filter paper, an LED
// panel drum for optomotor stimuli, an air-puff nozzle and a looming-disc
// stimulus. Units are millimetres.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim, useStore } from '../store'
import { ARENA, NOZZLE_ANGLE } from '../sim/config'
import { filterPaperTexture, breadboardTexture, gratingTexture } from './textures'
import { RATE_HZ } from '../sim/recorder'

export default function Arena() {
  const tool = useStore((s) => s.tool)
  const paper = useMemo(() => filterPaperTexture(), [])
  const board = useMemo(() => {
    const t = breadboardTexture().clone()
    t.needsUpdate = true
    t.repeat.set(24, 24)
    return t
  }, [])

  const wallGeo = useMemo(() => {
    const r0 = ARENA.radius
    const r1 = ARENA.radius + ARENA.wallThickness
    const h = ARENA.wallHeight
    const pts = [
      [r0, -1.2], [r0, h - 0.3], [r0 + 0.15, h - 0.05], [r1 - 0.15, h - 0.05], [r1, h - 0.3], [r1, -1.2],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    pts.push(pts[0].clone())
    return new THREE.LatheGeometry(pts, 128)
  }, [])

  const onFloor = (e) => {
    e.stopPropagation()
    const { tool } = useStore.getState()
    if (!tool) return
    if (tool === 'clean') {
      if (!sim.cleanAt(e.point.x, e.point.z)) sim.cleanNearest()
      return
    }
    if (sim.placeSubstrate(tool, e.point.x, e.point.z) && !e.shiftKey) {
      // Keep the tool armed only when shift is held.
      useStore.getState().setTool(null)
    }
  }

  // Light-weight glass: transparency and a clearcoat highlight, no
  // transmission pass.
  const glass = <meshPhysicalMaterial color="#dfeaf0" transparent opacity={0.18} roughness={0.05} clearcoat={1} depthWrite={false} />

  return (
    <group>
      {/* optical breadboard */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial map={board} roughness={0.75} metalness={0.35} color="#9aa0a6" />
      </mesh>

      {/* dish base */}
      <mesh position={[0, -0.62, 0]} receiveShadow>
        <cylinderGeometry args={[ARENA.radius + ARENA.wallThickness, ARENA.radius + ARENA.wallThickness, 1.2, 96]} />
        {glass}
      </mesh>

      {/* filter paper floor: the placement surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        receiveShadow
        onClick={onFloor}
        onPointerMove={(e) => (cursor.x = e.point.x, cursor.z = e.point.z, cursor.on = true)}
        onPointerOut={() => (cursor.on = false)}
      >
        <circleGeometry args={[ARENA.radius, 128]} />
        <meshStandardMaterial map={paper} roughness={0.97} color="#f2efe7" />
      </mesh>

      {/* dish wall */}
      <mesh geometry={wallGeo} castShadow={false} receiveShadow renderOrder={1}>
        {glass}
      </mesh>

      <PlacementCursor tool={tool} />
      <Drum />
      <Nozzle />
      <Loom />
      <Trail />
    </group>
  )
}

export const cursor = { x: 0, z: 0, on: false }

// Footprint preview for the armed substrate.
function PlacementCursor({ tool }) {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = !!tool && cursor.on
    ref.current.position.set(cursor.x, 0.05, cursor.z)
  })
  if (!tool) return null
  const r = tool === 'clean' ? 2.5 : null
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r ? r - 0.12 : 1.4, r ?? 1.55, 64]} />
        <meshBasicMaterial color={tool === 'clean' ? '#d9785b' : '#4fb39a'} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color={tool === 'clean' ? '#d9785b' : '#4fb39a'} />
      </mesh>
    </group>
  )
}

// Cylindrical LED panel arena showing a moving square-wave grating.
function Drum() {
  const ref = useRef()
  const mat = useRef()
  const fade = useRef(0)
  const map = useMemo(() => {
    const t = gratingTexture().clone()
    t.needsUpdate = true
    t.repeat.set(1.5, 1) // 24 periods -> 15 deg spatial period
    return t
  }, [])
  useFrame((_, dt) => {
    const on = sim.stimuli.drum
    fade.current += ((on ? 1 : 0) - fade.current) * Math.min(1, dt * 4)
    if (!ref.current) return
    ref.current.visible = fade.current > 0.01
    // 30 deg/s angular velocity of the pattern.
    map.offset.x -= sim.stimuli.drumDir * dt * (30 / 360) * 1.5
    mat.current.emissiveIntensity = 1.6 * fade.current
    mat.current.opacity = fade.current
  })
  return (
    <mesh ref={ref} position={[0, 9, 0]} visible={false}>
      <cylinderGeometry args={[34, 34, 26, 24, 1, true]} />
      <meshStandardMaterial ref={mat} map={map} emissiveMap={map} emissive="#ffffff" side={THREE.BackSide} transparent color="#000" />
    </mesh>
  )
}

// Stainless nozzle fed by silicone tubing; puffs are drawn as a short
// stream of entrained particles.
function Nozzle() {
  const pts = useRef()
  const N = 90
  const data = useMemo(() => {
    const pos = new Float32Array(N * 3)
    const seeds = Array.from({ length: N }, () => [Math.random(), Math.random() - 0.5, Math.random() - 0.5])
    return { pos, seeds }
  }, [])
  const ax = Math.cos(NOZZLE_ANGLE)
  const az = Math.sin(NOZZLE_ANGLE)
  const tip = new THREE.Vector3(ax * (ARENA.radius - 1.5), 5.2, az * (ARENA.radius - 1.5))
  const base = new THREE.Vector3(ax * (ARENA.radius + 8), 13, az * (ARENA.radius + 8))
  const dir = new THREE.Vector3().subVectors(tip, base)
  const len = dir.length()
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  const mid = new THREE.Vector3().addVectors(tip, base).multiplyScalar(0.5)

  useFrame(() => {
    const since = sim.t - sim.stimuli.puffAt
    const p = pts.current
    if (!p) return
    p.visible = since < 0.7
    if (!p.visible) return
    const flow = new THREE.Vector3(-ax, -0.32, -az).normalize()
    for (let i = 0; i < N; i++) {
      const [u, a, b] = data.seeds[i]
      const travel = (since * 1.6 + u) % 1
      const d = travel * 18
      const spread = 0.2 + travel * 3.2
      data.pos[i * 3] = tip.x + flow.x * d + a * spread * az
      data.pos[i * 3 + 1] = Math.max(0.1, tip.y + flow.y * d + b * spread * 0.6)
      data.pos[i * 3 + 2] = tip.z + flow.z * d - a * spread * ax
    }
    p.geometry.attributes.position.needsUpdate = true
    p.material.opacity = 0.5 * (1 - since / 0.7)
  })

  return (
    <group>
      <mesh position={mid} quaternion={quat} castShadow>
        <cylinderGeometry args={[0.45, 0.55, len, 20]} />
        <meshStandardMaterial color="#c9ced3" metalness={0.95} roughness={0.22} />
      </mesh>
      <mesh position={tip} quaternion={quat}>
        <cylinderGeometry args={[0.28, 0.42, 0.6, 20]} />
        <meshStandardMaterial color="#9aa1a8" metalness={0.95} roughness={0.3} />
      </mesh>
      <mesh position={base.clone().add(new THREE.Vector3(ax * 6, 2, az * 6))} quaternion={quat}>
        <cylinderGeometry args={[1.1, 1.1, 14, 20]} />
        <meshStandardMaterial color="#d8dcd2" transparent opacity={0.7} roughness={0.5} />
      </mesh>
      <points ref={pts} visible={false} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={N} array={data.pos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#f2f5f7" size={0.35} sizeAttenuation transparent opacity={0.4} depthWrite={false} />
      </points>
    </group>
  )
}

// Looming stimulus: a dark disc whose angular size expands with
// l/v = 40 ms dynamics, positioned above the fly in the stimulus direction.
function Loom() {
  const ref = useRef()
  const mat = useRef()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const since = sim.t - sim.stimuli.loomAt
    if (!ref.current) return
    const on = since >= 0 && since < 1.4
    ref.current.visible = on
    if (!on) return
    const f = sim.fly
    const az = sim.stimuli.loomAz
    const ttc = 0.9 - since // time to collision
    const half = ttc > 0.02 ? Math.min(1.25, Math.atan(0.04 / ttc)) : 1.25
    const dist = 16
    v.set(f.x + Math.cos(az) * dist * 0.55, 12, f.z + Math.sin(az) * dist * 0.55)
    ref.current.position.copy(v)
    ref.current.lookAt(f.x, 0.5, f.z)
    ref.current.scale.setScalar(Math.tan(half) * dist * 0.6)
    mat.current.opacity = since < 1.0 ? 0.92 : 0.92 * (1 - (since - 1) / 0.4)
  })
  return (
    <mesh ref={ref} visible={false} renderOrder={4}>
      <circleGeometry args={[1, 48]} />
      <meshBasicMaterial ref={mat} color="#050505" transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// Tracking overlay: the last 20 s of the centroid path, drawn on the floor.
function Trail() {
  const show = useStore((s) => s.trail)
  const ref = useRef()
  const N = RATE_HZ * 20
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return g
  }, [N])
  const c = useMemo(() => new THREE.Color('#4fb39a'), [])
  const bg = useMemo(() => new THREE.Color('#f2efe7'), [])
  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    if (!ref.current || !show) return
    const R = sim.recorder
    const pos = geom.attributes.position.array
    const col = geom.attributes.color.array
    const n = R.forEachRecent(N, (i, k, m) => {
      pos[k * 3] = R.x[i]
      pos[k * 3 + 1] = 0.04 + R.y[i] * 0
      pos[k * 3 + 2] = R.z[i]
      tmp.copy(bg).lerp(c, Math.pow(k / m, 1.5))
      col[k * 3] = tmp.r
      col[k * 3 + 1] = tmp.g
      col[k * 3 + 2] = tmp.b
    })
    geom.setDrawRange(0, n)
    geom.attributes.position.needsUpdate = true
    geom.attributes.color.needsUpdate = true
  })
  if (!show) return null
  return (
    <line ref={ref} geometry={geom} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.9} />
    </line>
  )
}
