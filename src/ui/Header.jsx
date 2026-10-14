import { useStore } from '../store'
import { formatTimeOfDay, formatClock } from '../sim/clock'
import { LEVELS, MAX_LEVEL } from '../sim/config'
import { Icon } from './icons'

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <ellipse cx="10" cy="12" rx="2.6" ry="5.2" />
      <circle cx="10" cy="5.2" r="1.7" />
      <path d="M10 8.6C6.4 4.6 2.4 6 3.6 9.6 4.4 11.6 7.4 11 9 10M10 8.6c3.6-4 7.6-2.6 6.4 1-.8 2-3.8 1.4-5.4.4" />
    </svg>
  )
}

export default function Header() {
  const zt = useStore((s) => s.snap.zt)
  const light = useStore((s) => s.snap.light)
  const lightMode = useStore((s) => s.snap.lightMode)
  const t = useStore((s) => s.snap.t)
  const prog = useStore((s) => s.snap.progression)
  const muted = useStore((s) => s.muted)
  const setMuted = useStore((s) => s.setMuted)
  const openHelp = useStore((s) => s.openHelp)

  const next = prog.level < MAX_LEVEL ? LEVELS[prog.level + 1] : null
  const lightLabel = lightMode === 'auto' ? (light > 0.5 ? 'Day' : 'Night') : lightMode === 'on' ? 'Lights on' : 'Lights off'

  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">VirFly</span>
        <span className="brand-ver">v1.0</span>
      </div>
      <span className="brand-sub">A virtual fruit fly driven by a map of its real brain</span>
      <div className="header-spacer" />
      <div className="meta">
        <span className="meta-item hide-sm">Fly <b>#01 ♀</b></span>
        <span className="meta-item">
          <span className="light-dot" style={{ background: light > 0.5 ? '#e8e1cf' : '#33415a' }} />
          <b>{formatTimeOfDay(zt)}</b> {lightLabel}
        </span>
        <span className="meta-item hide-sm">Session <b>{formatClock(t)}</b></span>
        <span className="meta-item">
          Care level <b>{prog.level}</b>
          {next !== null && <span className="hide-xs"> · {prog.carePoints}/{next} pts</span>}
        </span>
      </div>
      <div className="header-actions">
        <button className="btn ghost" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'mute' : 'sound'} />
        </button>
        <button className="btn ghost" onClick={openHelp} aria-label="How to play" title="How to play (H)">
          <Icon name="help" />
        </button>
      </div>
    </header>
  )
}
