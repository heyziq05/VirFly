import { create } from 'zustand'
import { createSimulation } from './sim/simulation'
import { loadSession, saveSession, clearSession } from './utils/save'
import { playSfx } from './audio/audio'

export const sim = createSimulation(loadSession())

let resetting = false
export function resetSession() {
  resetting = true
  clearSession()
  window.location.reload()
}

// UI state plus a low-rate snapshot of the simulation for React.
// High-rate consumers (3D scene, canvases) read `sim` directly.
export const useStore = create((set, get) => ({
  tool: null, // substrate id when placing, 'clean' when cleaning
  panel: 'physiology',
  camera: 'track', // 'track' | 'arena'
  trail: true,
  hand: false, // drag-and-drop mode for picking up the fly
  muted: false,
  selectedModule: null,
  toast: null,
  helpOpen: !hasSeenHelp(),
  worldVersion: 0,
  snap: takeSnapshot(),

  setTool: (tool) => set({ tool: get().tool === tool ? null : tool, hand: false }),
  toggleHand: () => set({ hand: !get().hand, tool: null }),
  setPanel: (panel) => set({ panel }),
  setCamera: (camera) => set({ camera }),
  toggleCamera: () => set({ camera: get().camera === 'track' ? 'arena' : 'track' }),
  toggleTrail: () => set({ trail: !get().trail }),
  setMuted: (muted) => set({ muted }),
  selectModule: (selectedModule) => set({ selectedModule }),
  closeHelp: () => {
    try { localStorage.setItem('virfly-help-seen', '1') } catch { /* storage unavailable */ }
    set({ helpOpen: false })
  },
  openHelp: () => set({ helpOpen: true }),
  showToast: (text) => {
    const toast = { text, id: Math.random() }
    set({ toast })
    setTimeout(() => { if (get().toast?.id === toast.id) set({ toast: null }) }, 3200)
  },
  refresh: () => set({ snap: takeSnapshot() }),
}))

function hasSeenHelp() {
  try { return localStorage.getItem('virfly-help-seen') === '1' } catch { return false }
}

function takeSnapshot() {
  return {
    t: sim.t,
    zt: sim.zt,
    light: sim.light,
    lightMode: sim.lightMode,
    behaviour: sim.fly.behaviour,
    needs: { ...sim.needs },
    preferences: { ...sim.preferences },
    progression: { ...sim.progression },
    stats: { ...sim.stats },
    hygiene: sim.hygiene,
    labels: sim.labels,
    drum: sim.stimuli.drum,
    silenced: sim.brain.silencedList(),
    substrateCount: sim.substrates.length,
    frassCount: sim.frass.length,
    logLength: sim.log.length,
    distance: sim.recorder.distance,
  }
}

sim.subscribe((type, payload) => {
  const s = useStore.getState()
  if (type === 'world') useStore.setState({ worldVersion: sim.worldVersion })
  else if (type === 'toast') s.showToast(payload)
  else if (type === 'sfx' && !s.muted) playSfx(payload)
})

// Physiology history for the sparklines, 1 Hz, last 4 minutes.
export const needHistory = { length: 240, data: {}, count: 0 }
for (const k of ['hunger', 'thirst', 'energy', 'valence', 'curiosity', 'habituation', 'hygiene']) {
  needHistory.data[k] = new Float32Array(needHistory.length)
}

if (typeof window !== 'undefined') {
  setInterval(() => useStore.getState().refresh(), 200)
  setInterval(() => {
    const h = needHistory
    for (const k of Object.keys(h.data)) {
      const arr = h.data[k]
      arr.copyWithin(0, 1)
      arr[h.length - 1] = k === 'hygiene' ? sim.hygiene : sim.needs[k]
    }
    h.count = Math.min(h.length, h.count + 1)
  }, 1000)
  setInterval(() => !resetting && saveSession(sim.serialise()), 5000)
  window.addEventListener('beforeunload', () => !resetting && saveSession(sim.serialise()))
}
