import { useStore } from '../store'
import Physiology from './panels/Physiology'
import Connectome from './panels/Connectome'
import Ethogram from './panels/Ethogram'
import Notes from './panels/Notes'

const TABS = [
  ['physiology', 'Fly'],
  ['connectome', 'Brain'],
  ['ethogram', 'Behaviour'],
  ['notes', 'About'],
]

export default function SidePanel() {
  const panel = useStore((s) => s.panel)
  const setPanel = useStore((s) => s.setPanel)
  return (
    <aside className="side">
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={panel === id} className={`tab ${panel === id ? 'on' : ''}`} onClick={() => setPanel(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {panel === 'physiology' && <Physiology />}
        {panel === 'connectome' && <Connectome />}
        {panel === 'ethogram' && <Ethogram />}
        {panel === 'notes' && <Notes />}
      </div>
    </aside>
  )
}
