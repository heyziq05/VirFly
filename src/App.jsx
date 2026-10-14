import { useEffect } from 'react'
import Viewport from './scene/Viewport'
import Header from './ui/Header'
import ViewportHUD from './ui/ViewportHUD'
import Toolbar from './ui/Toolbar'
import SidePanel from './ui/SidePanel'
import { sim, useStore } from './store'
import { SUBSTRATES } from './sim/config'
import { startAudio, setMuted } from './audio/audio'

const SUBSTRATE_KEYS = Object.keys(SUBSTRATES)

export default function App() {
  const ir = useStore((s) => s.snap.light < 0.35)
  const muted = useStore((s) => s.muted)

  useEffect(() => setMuted(muted), [muted])

  useEffect(() => {
    const start = () => {
      startAudio()
      window.removeEventListener('pointerdown', start)
    }
    window.addEventListener('pointerdown', start)
    return () => window.removeEventListener('pointerdown', start)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const S = useStore.getState()
      const k = e.key.toLowerCase()
      const n = Number(e.key)
      if (n >= 1 && n <= SUBSTRATE_KEYS.length) {
        const id = SUBSTRATE_KEYS[n - 1]
        if (SUBSTRATES[id].level <= sim.progression.level) S.setTool(id)
        else S.showToast(`${SUBSTRATES[id].label} unlocks at care level ${SUBSTRATES[id].level}`)
      } else if (k === 'c') S.setTool('clean')
      else if (k === 'x') sim.cleanNearest()
      else if (k === 'g') S.toggleHand()
      else if (k === 'q') sim.stimulate('puff')
      else if (k === 'w') sim.stimulate('loom')
      else if (k === 'e') sim.stimulate('drum')
      else if (k === 'l') sim.setLightMode({ auto: 'on', on: 'off', off: 'auto' }[sim.lightMode])
      else if (k === 'v') S.toggleCamera()
      else if (k === 't') S.toggleTrail()
      else if (k === 'escape') S.setTool(null)
      else if (k === '?' || k === 'h') S.helpOpen ? S.closeHelp() : S.openHelp()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Header />
      <div className="main">
        <div className="stage">
          <div className={`viewport ${ir ? 'ir' : ''}`}>
            <Viewport />
            <ViewportHUD />
          </div>
          <Toolbar />
        </div>
        <SidePanel />
      </div>
    </div>
  )
}
