// Food and water substrates, and frass deposits. Appearance tracks the
// simulated state each frame: fruit browns as it ferments and grows mould
// colonies; droplets shrink as they evaporate.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim, useStore } from '../store'
import { SUBSTRATES, FRUIT_AGE, DROP_LIFETIME } from '../sim/config'
import { bananaTexture, appleTexture, grapeTexture, grainBump } from './textures'

const MOULD_MAX = 40

function capGeometry(base, height) {
  // Spherical cap with footprint radius `base` and height `height`.
  const R = (base * base + height * height) / (2 * height)
  const theta = Math.asin(Math.min(1, base / R))
  const g = new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, height > R ? Math.PI - theta : theta)
  g.translate(0, height - R, 0)
  return g
}

function slabGeometry(radius, height, bevel = 0.35, wobble = 0.04, seed = 1) {
  // Lathe profile: flat bottom, slightly rounded rim, flat top.
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(radius - bevel, 0)]
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, height / 2 + Math.sin(a) * (height / 2)))
  }
  pts.push(new THREE.Vector2(0.001, height))
  const g = new THREE.LatheGeometry(pts, 72)
  // Irregular outline, as a hand-cut slice.
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const a = Math.atan2(z, x)
    const k = 1 + wobble * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 7 + seed * 2) * 0.4)
    p.setX(i, x * k)
    p.setZ(i, z * k)
  }
  g.computeVertexNormals()
  return g
}

function blobGeometry(radius, height) {
  const g = new THREE.SphereGeometry(1, 48, 32)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 1 + 0.12 * Math.sin(x * 5.1 + z * 3.3) * Math.cos(y * 4.2 + x * 2.1) + 0.06 * Math.sin(z * 11 + y * 9)
    p.setXYZ(i, x * radius * n, Math.max(0, y) * height * n, z * radius * n)
  }
  g.computeVertexNormals()
  return g
}

function useSubstrateAssets() {
  return useMemo(() => {
    const grain = grainBump()
    // Droplets use plain transparency rather than glass transmission, which
    // would need an extra render pass every frame.
    const water = new THREE.MeshPhysicalMaterial({
      color: '#cfe3ec', transparent: true, opacity: 0.3, roughness: 0.02, clearcoat: 1, envMapIntensity: 2, depthWrite: false,
    })
    const sucrose = water.clone()
    sucrose.color = new THREE.Color('#fff8e8')
    sucrose.ior = 1.35
    return {
      geo: {
        banana: slabGeometry(SUBSTRATES.banana.radius, SUBSTRATES.banana.height, 0.7, 0.05, 1),
        apple: slabGeometry(SUBSTRATES.apple.radius, 1.5, 0.3, 0.02, 3),
        grape: (() => {
          const g = new THREE.SphereGeometry(SUBSTRATES.grape.radius, 56, 28, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
          g.scale(1, 0.75, 1)
          g.translate(0, SUBSTRATES.grape.radius * 0.75, 0)
          return g
        })(),
        grapeFace: new THREE.CircleGeometry(SUBSTRATES.grape.radius, 56),
        top: new THREE.CircleGeometry(1, 72),
        yeast: blobGeometry(SUBSTRATES.yeast.radius, SUBSTRATES.yeast.height),
        water: capGeometry(SUBSTRATES.water.radius, SUBSTRATES.water.height),
        sucrose: capGeometry(SUBSTRATES.sucrose.radius, SUBSTRATES.sucrose.height),
        mould: new THREE.IcosahedronGeometry(1, 1),
      },
      mat: {
        bananaSide: new THREE.MeshPhysicalMaterial({ color: '#f1e8c8', roughness: 0.62, clearcoat: 0.5, clearcoatRoughness: 0.5, bumpMap: grain, bumpScale: 0.5, sheen: 0.4 }),
        bananaTop: new THREE.MeshPhysicalMaterial({ map: bananaTexture(), roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.4, bumpMap: grain, bumpScale: 0.6 }),
        appleSide: new THREE.MeshPhysicalMaterial({ color: '#8f1d18', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
        appleTop: new THREE.MeshPhysicalMaterial({ map: appleTexture(), roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.3, bumpMap: grain, bumpScale: 0.4 }),
        grapeSkin: new THREE.MeshPhysicalMaterial({ color: '#3a1838', roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#b9a8c8'), sheenRoughness: 0.4 }),
        grapeFace: new THREE.MeshPhysicalMaterial({ map: grapeTexture(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }),
        yeast: new THREE.MeshPhysicalMaterial({ color: '#cfb17a', roughness: 0.8, bumpMap: grain, bumpScale: 1.4, sheen: 0.5, sheenColor: new THREE.Color('#f4e2bd') }),
        water,
        sucrose,
        mould: new THREE.MeshStandardMaterial({ color: '#e4e7dc', roughness: 1 }),
      },
    }
  }, [])
}

const FRESH = new THREE.Color('#ffffff')
const BROWN = new THREE.Color('#a77a47')
const ROT = new THREE.Color('#5e4a2e')

function Substrate({ s, assets }) {
  const def = SUBSTRATES[s.type]
  const group = useRef()
  const body = useRef()
  const mould = useRef()
  const tintTargets = useRef([])
  const mats = useMemo(() => {
    // Per-instance clones so each item can age independently.
    const clone = (m) => {
      const c = m.clone()
      c.userData.base = m.color.clone()
      tintTargets.current.push(c)
      return c
    }
    const A = assets.mat
    switch (s.type) {
      case 'banana': return { side: clone(A.bananaSide), top: clone(A.bananaTop) }
      case 'apple': return { side: clone(A.appleSide), top: clone(A.appleTop) }
      case 'grape': return { side: clone(A.grapeSkin), top: clone(A.grapeFace) }
      case 'yeast': return { side: clone(A.yeast) }
      default: return { side: A[s.type] }
    }
  }, [assets, s.type])

  const mouldSeeds = useMemo(
    () => Array.from({ length: MOULD_MAX }, (_, i) => {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * def.radius * 0.85
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, at: Math.random(), s: 0.5 + Math.random() * 0.8 }
    }),
    [def.radius]
  )
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const age = sim.t - s.placedAt
    if (!group.current) return
    if (def.kind === 'drop') {
      const life = Math.max(0.05, 1 - age / DROP_LIFETIME)
      const k = Math.sqrt(Math.min(life, s.amount + 0.05))
      group.current.scale.set(k, Math.max(0.2, k * k), k)
      return
    }
    // Fruit: fresh -> fermenting (browning) -> mouldy.
    const ferment = THREE.MathUtils.clamp((age - FRUIT_AGE.fermentAt * 0.6) / (FRUIT_AGE.mouldAt - FRUIT_AGE.fermentAt * 0.6), 0, 1)
    const rot = THREE.MathUtils.clamp((age - FRUIT_AGE.mouldAt) / 60, 0, 1)
    for (const m of tintTargets.current) {
      m.color.copy(m.userData.base).multiply(FRESH.clone().lerp(BROWN, ferment * 0.55).lerp(ROT, rot * 0.5))
      m.clearcoat = 0.5 + ferment * 0.4
    }
    group.current.scale.set(1, 0.7 + 0.3 * s.amount, 1)
    if (mould.current) {
      const grow = THREE.MathUtils.clamp((age - FRUIT_AGE.mouldAt * 0.85) / 90, 0, 1)
      let n = 0
      const topY = s.type === 'grape' ? def.height * 0.0 + SUBSTRATES.grape.radius * 0.75 : s.type === 'apple' ? 1.5 : def.height
      for (const seed of mouldSeeds) {
        if (seed.at > grow) continue
        const size = 0.15 + 0.4 * seed.s * Math.min(1, (grow - seed.at) * 3)
        v.set(seed.x, topY * (s.type === 'yeast' ? 0.6 : 1), seed.z)
        sc.set(size, size * 0.55, size)
        m4.compose(v, q, sc)
        mould.current.setMatrixAt(n++, m4)
      }
      mould.current.count = n
      mould.current.instanceMatrix.needsUpdate = true
    }
  })

  const onClick = (e) => {
    e.stopPropagation()
    const tool = useStore.getState().tool
    if (tool && tool !== 'clean') return
    sim.removeSubstrate(s.id)
  }

  const G = assets.geo
  let content
  if (s.type === 'banana' || s.type === 'apple') {
    const h = s.type === 'banana' ? def.height : 1.5
    content = (
      <>
        <mesh ref={body} geometry={G[s.type]} material={mats.side} castShadow receiveShadow />
        <mesh geometry={G.top} material={mats.top} rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.002, 0]} scale={def.radius - (s.type === 'banana' ? 0.66 : 0.3)} receiveShadow />
      </>
    )
  } else if (s.type === 'grape') {
    content = (
      <>
        <mesh geometry={G.grape} material={mats.side} castShadow receiveShadow rotation={[Math.PI, 0, 0]} position={[0, SUBSTRATES.grape.radius * 0.75, 0]} />
        <mesh geometry={G.grapeFace} material={mats.top} rotation={[-Math.PI / 2, 0, 0]} position={[0, SUBSTRATES.grape.radius * 0.75 + 0.002, 0]} receiveShadow />
      </>
    )
  } else if (s.type === 'yeast') {
    content = <mesh geometry={G.yeast} material={mats.side} castShadow receiveShadow />
  } else {
    content = <mesh geometry={G[s.type]} material={mats.side} castShadow={false} receiveShadow renderOrder={2} />
  }

  return (
    <group position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]} onClick={onClick}>
      <group ref={group}>
        {content}
        {def.kind === 'fruit' && <instancedMesh ref={mould} args={[G.mould, assets.mat.mould, MOULD_MAX]} castShadow />}
      </group>
    </group>
  )
}

export function Substrates() {
  useStore((s) => s.worldVersion)
  const assets = useSubstrateAssets()
  return sim.substrates.map((s) => <Substrate key={s.id} s={s} assets={assets} />)
}

// Frass: small glossy deposits. A larger invisible instanced mesh makes them
// easy to click.
export function Frass() {
  useStore((s) => s.worldVersion)
  const vis = useRef()
  const hit = useRef()
  const geo = useMemo(() => new THREE.SphereGeometry(1, 12, 8), [])
  const items = sim.frass
  useFrame(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    if (!vis.current) return
    items.forEach((f, i) => {
      p.set(f.x, f.size * 0.25, f.z)
      s.set(f.size, f.size * 0.45, f.size)
      m.compose(p, q, s)
      vis.current.setMatrixAt(i, m)
      s.set(1.3, 0.4, 1.3)
      m.compose(p, q, s)
      hit.current.setMatrixAt(i, m)
    })
    vis.current.count = items.length
    hit.current.count = items.length
    vis.current.instanceMatrix.needsUpdate = true
    hit.current.instanceMatrix.needsUpdate = true
  })
  const onClick = (e) => {
    e.stopPropagation()
    const f = items[e.instanceId]
    if (f) sim.removeFrass(f.id)
  }
  return (
    <group>
      <instancedMesh ref={vis} args={[geo, undefined, 32]} castShadow>
        <meshPhysicalMaterial color="#3b2412" roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
      </instancedMesh>
      <instancedMesh ref={hit} args={[geo, undefined, 32]} onClick={onClick}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
