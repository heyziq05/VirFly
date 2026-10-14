import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { sim, useStore } from '../store'
import Arena from './Arena'
import Drosophila, { flyAnchor } from './Drosophila'
import { Substrates, Frass } from './Substrates'

// Screen-space quantities for the HTML overlay (tracking box, scale bar).
// Written every frame here and read by the overlay with requestAnimationFrame.
export const overlay = { x: 0, y: 0, w: 0, h: 0, pxPerMm: 0, visible: false, width: 1, height: 1 }

// Hold mode: press on the fly, drag it across the dish, release to drop it.
// Uses DOM pointer events so it works the same with mouse, pen and touch.
function DragController() {
  const { gl, camera, controls } = useThree()
  const hand = useStore((s) => s.hand)
  useEffect(() => {
    if (!hand) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    // Drag on the plane the held fly sits in, so it stays under the finger.
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.0)
    const hit = new THREE.Vector3()
    let pointerId = null

    const toFloor = (e) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return ray.ray.intersectPlane(floor, hit)
    }
    const down = (e) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - r.left - overlay.x
      const dy = e.clientY - r.top - overlay.y
      // Generous grab radius, larger on touch screens.
      const reach = Math.max(e.pointerType === 'touch' ? 44 : 30, overlay.w * 0.55)
      if (!overlay.visible || Math.hypot(dx, dy) > reach) return
      e.stopPropagation()
      e.preventDefault()
      pointerId = e.pointerId
      el.setPointerCapture?.(e.pointerId)
      if (controls) controls.enabled = false
      sim.pickUp()
    }
    const move = (e) => {
      if (e.pointerId !== pointerId) return
      e.preventDefault()
      if (toFloor(e)) sim.holdMove(hit.x, hit.z)
    }
    const up = (e) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      el.releasePointerCapture?.(e.pointerId)
      if (controls) controls.enabled = true
      sim.release()
    }
    // Capture phase on the wrapper runs before the camera controls see the press.
    const wrap = el.parentElement
    wrap.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      wrap.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (pointerId !== null) sim.release()
      if (controls) controls.enabled = true
    }
  }, [hand, gl, camera, controls])
  return null
}

function SimDriver() {
  useFrame((_, dt) => sim.step(dt), -1)
  return null
}

const ARENA_VIEW = { pos: new THREE.Vector3(0, 58, 44), target: new THREE.Vector3(0, 0, 0) }

function CameraRig() {
  const controls = useRef()
  const mode = useStore((s) => s.camera)
  const transition = useRef(0)
  const { camera } = useThree()
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const offset = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    transition.current = 1.2
  }, [mode])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (mode === 'track' && !sim.fly.held) {
      tmp.set(flyAnchor.x, Math.min(flyAnchor.y, 3) * 0.6 + 0.3, flyAnchor.z)
      const k = 1 - Math.exp(-dt * 5)
      offset.subVectors(tmp, c.target).multiplyScalar(k)
      c.target.add(offset)
      camera.position.add(offset)
      if (transition.current > 0) {
        // Ease the camera in to a working distance of ~14 mm.
        transition.current -= dt
        const dir = tmp.subVectors(camera.position, c.target)
        const d = dir.length()
        const want = THREE.MathUtils.clamp(d, 8, 16)
        const el = Math.max(0.35, Math.asin(Math.min(1, dir.y / d)))
        dir.normalize()
        if (el < 0.4) dir.y = 0.45
        dir.normalize().multiplyScalar(d + (want - d) * Math.min(1, dt * 3))
        camera.position.copy(c.target).add(dir)
      }
    } else if (transition.current > 0) {
      transition.current -= dt
      const k = Math.min(1, dt * 3)
      c.target.lerp(ARENA_VIEW.target, k)
      camera.position.lerp(ARENA_VIEW.pos, k)
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={110}
      maxPolarAngle={1.42}
      target={[sim.fly.x, 0.4, sim.fly.z]}
    />
  )
}

function Lights() {
  const key = useRef()
  const fill = useRef()
  const ir = useRef()
  useFrame(() => {
    const L = sim.light
    key.current.intensity = 1.9 * L
    fill.current.intensity = 0.3 * L + 0.04
    ir.current.intensity = 1.5 * (1 - L)
    key.current.target.position.set(0, 0, 0)
  })
  return (
    <>
      <directionalLight
        ref={key}
        position={[18, 70, 26]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={20}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
      />
      <hemisphereLight ref={fill} args={['#eef2f8', '#2b2724', 0.55]} />
      {/* 850 nm illuminator for the dark phase; the camera renders it greyscale */}
      <directionalLight ref={ir} position={[-30, 40, -10]} intensity={0} color="#ffffff" />
    </>
  )
}

function Studio() {
  // Procedural reflections: an LED ring light over the dish plus two
  // softboxes. No HDR files are fetched.
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.55}>
      <color attach="background" args={['#0c0d0e']} />
      <Lightformer form="ring" intensity={4} color="#ffffff" position={[0, 60, 0]} rotation={[Math.PI / 2, 0, 0]} scale={34} />
      <Lightformer form="rect" intensity={1.2} color="#e9eef5" position={[60, 30, 20]} rotation={[0, -Math.PI / 2, 0]} scale={[60, 30, 1]} />
      <Lightformer form="rect" intensity={0.6} color="#f4ead8" position={[-60, 20, -30]} rotation={[0, Math.PI / 2, 0]} scale={[60, 30, 1]} />
      <Lightformer form="rect" intensity={0.3} color="#ffffff" position={[0, 10, -80]} scale={[120, 20, 1]} />
    </Environment>
  )
}

function OverlayProbe() {
  const { camera, size } = useThree()
  const a = useMemo(() => new THREE.Vector3(), [])
  const b = useMemo(() => new THREE.Vector3(), [])
  const r = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    overlay.width = size.width
    overlay.height = size.height
    a.copy(flyAnchor).project(camera)
    overlay.visible = a.z < 1 && Math.abs(a.x) < 1.2 && Math.abs(a.y) < 1.2
    overlay.x = (a.x * 0.5 + 0.5) * size.width
    overlay.y = (-a.y * 0.5 + 0.5) * size.height
    // 1 mm along the camera's right vector at the fly's depth.
    r.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    b.copy(flyAnchor).add(r).project(camera)
    overlay.pxPerMm = Math.abs(b.x - a.x) * 0.5 * size.width
    const box = Math.max(28, overlay.pxPerMm * 3.6)
    overlay.w = box
    overlay.h = box
  })
  return null
}

export default function Viewport() {
  const tool = useStore((s) => s.tool)
  const hand = useStore((s) => s.hand)
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.25]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ position: [sim.fly.x + 9, 8, sim.fly.z + 10], fov: 30, near: 0.3, far: 1500 }}
      style={{ cursor: tool ? 'crosshair' : hand ? 'grab' : 'default' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.9
      }}
    >
      <color attach="background" args={['#0b0c0d']} />
      <fog attach="fog" args={['#0b0c0d', 140, 420]} />
      <SimDriver />
      <Suspense fallback={null}>
        <Studio />
        <Lights />
        <Arena />
        <Substrates />
        <Frass />
        <Drosophila />
      </Suspense>
      <CameraRig />
      <DragController />
      <OverlayProbe />
    </Canvas>
  )
}

