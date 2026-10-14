import { useEffect, useRef } from 'react'
import { sim, useStore } from '../store'
import { overlay } from '../scene/Viewport'
import { BEHAVIOURS } from '../sim/config'
import { formatClock } from '../sim/clock'

const NICE = [0.25, 0.5, 1, 2, 5, 10]

export default function ViewportHUD() {
  const reticle = useRef()
  const label = useRef()
  const bar = useRef()
  const barText = useRef()
  const pos = useRef()
  const kin = useRef()
  const fps = useRef()
  const camera = useStore((s) => s.camera)
  const light = useStore((s) => s.snap.light)
  const t = useStore((s) => s.snap.t)
  const toast = useStore((s) => s.toast)
  const helpOpen = useStore((s) => s.helpOpen)
  const closeHelp = useStore((s) => s.closeHelp)
  const hand = useStore((s) => s.hand)
  const held = useStore((s) => s.snap.behaviour === 'held')

  useEffect(() => {
    let raf
    let frames = 0
    let last = performance.now()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      frames++
      const now = performance.now()
      if (now - last > 500) {
        if (fps.current) fps.current.textContent = `${Math.round((frames * 1000) / (now - last))} fps`
        frames = 0
        last = now
      }
      const f = sim.fly
      if (reticle.current) {
        const r = reticle.current
        r.style.display = overlay.visible ? 'block' : 'none'
        r.style.left = `${overlay.x}px`
        r.style.top = `${overlay.y}px`
        r.style.width = `${overlay.w}px`
        r.style.height = `${overlay.h}px`
        label.current.textContent = `${BEHAVIOURS[f.behaviour].label.toUpperCase()}${f.y > 0.05 ? `  z ${f.y.toFixed(1)}` : ''}`
      }
      if (bar.current && overlay.pxPerMm > 0) {
        let mm = NICE[NICE.length - 1]
        for (const n of NICE) {
          if (n * overlay.pxPerMm >= 48) {
            mm = n
            break
          }
        }
        bar.current.style.width = `${Math.min(240, mm * overlay.pxPerMm)}px`
        barText.current.textContent = mm < 1 ? `${mm * 1000} µm` : `${mm} mm`
      }
      if (pos.current) {
        pos.current.textContent = `${f.x >= 0 ? ' ' : ''}${f.x.toFixed(2)}, ${f.z >= 0 ? ' ' : ''}${f.z.toFixed(2)} mm`
        const deg = ((((-f.heading * 180) / Math.PI) % 360) + 360) % 360
        kin.current.textContent = `${deg.toFixed(0).padStart(3, ' ')}°  ${f.speed.toFixed(1).padStart(4, ' ')} mm/s`
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])

  const ir = light < 0.35

  return (
    <div className="hud">
      <div className="hud-corner hud-tl">
        <div className="row">
          <span className="rec">REC</span>
          <span>{formatClock(t)}</span>
        </div>
        <div className="row"><span className="k">CAMERA</span><span>{camera === 'track' ? 'following the fly' : 'whole dish'}</span></div>
        <div className="row"><span className="k">SPEED</span><span ref={fps}>— fps</span></div>
      </div>

      <div className="hud-corner hud-tr">
        {ir ? <span className="badge-ir">Night camera (infrared)</span> : <span className="k">Lights on</span>}
        <span className="k">25 °C · 60 % humidity</span>
      </div>

      <div className="hud-corner hud-bl">
        <div className="scalebar">
          <span ref={barText}>1 mm</span>
          <div className="bar" ref={bar} style={{ width: 60 }} />
        </div>
      </div>

      <div className="hud-corner hud-br">
        <div className="row"><span className="k">POSITION</span><span ref={pos} style={{ whiteSpace: 'pre' }} /></div>
        <div className="row"><span className="k">HEADING, SPEED</span><span ref={kin} style={{ whiteSpace: 'pre' }} /></div>
      </div>

      <div className="reticle" ref={reticle}>
        <i /><i /><i /><i />
        <span ref={label} />
      </div>

      {toast && <div className="toast" key={toast.id}>{toast.text}</div>}
      {hand && !toast && (
        <div className="toast hint">{held ? 'Let go to put the fly down' : 'Hold mode: press on the fly and drag it'}</div>
      )}

      {helpOpen && (
        <div className="help">
          <h3>How to play</h3>
          <p>This is one fruit fly in a small glass dish. It decides what to do using a model built from a real map of a fly's brain.</p>
          <ol>
            <li>Choose food or water<span className="keys"> (<kbd>1</kbd>–<kbd>6</kbd>)</span> and tap the dish floor to put it down. A hungry or thirsty fly will find it by smell or by the damp air.</li>
            <li>Clean up droppings and mouldy fruit with <b>Clean</b><span className="keys"> (<kbd>C</kbd>)</span>, or click them.</li>
            <li>Turn on <b>Hold fly</b><span className="keys"> (<kbd>G</kbd>)</span>, then press on the fly and drag it to move it somewhere else.</li>
            <li>Try a test: air puff, shadow or moving stripes. Tap the fly to touch it with a brush.</li>
            <li>Day and night change on their own (a full day takes 4 minutes). Use the <b>Light</b> buttons to control them.</li>
            <li>Open the <b>Brain</b> tab to watch its brain areas light up, or switch one off and see what the fly can no longer do.</li>
          </ol>
          <button className="btn" style={{ pointerEvents: 'auto' }} onClick={closeHelp}>Start</button>
        </div>
      )}
    </div>
  )
}
