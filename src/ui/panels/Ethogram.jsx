import { useEffect, useState } from 'react'
import { sim, useStore } from '../../store'
import { useCanvas, COLORS } from '../canvas'
import { BEHAVIOURS, BEHAVIOUR_ORDER, SUBSTRATES, ARENA } from '../../sim/config'
import { RATE_HZ } from '../../sim/recorder'
import { substrateStage } from '../../sim/sensing'
import { formatClock } from '../../sim/clock'
import { downloadText } from '../../utils/save'
import { Icon } from '../icons'

const WINDOW_S = 180

function EthogramRaster() {
  const rowH = 13
  const height = BEHAVIOUR_ORDER.length * rowH + 20
  const ref = useCanvas(
    (ctx, w) => {
      const labelW = 92
      const tw = w - labelW
      const R = sim.recorder
      const N = WINDOW_S * RATE_HZ
      ctx.font = '10.5px "IBM Plex Sans", sans-serif'
      ctx.textBaseline = 'middle'
      BEHAVIOUR_ORDER.forEach((b, i) => {
        ctx.fillStyle = COLORS.muted
        ctx.fillText(BEHAVIOURS[b].label, 0, i * rowH + rowH / 2)
        ctx.fillStyle = 'rgba(255,255,255,0.025)'
        ctx.fillRect(labelW, i * rowH + 1, tw, rowH - 2)
      })
      // Draw runs of identical behaviour as single rectangles.
      let runStart = -1
      let runB = -1
      const flush = (endK, m) => {
        if (runB < 0) return
        const x0 = labelW + ((N - m + runStart) / N) * tw
        const x1 = labelW + ((N - m + endK) / N) * tw
        ctx.fillStyle = BEHAVIOURS[BEHAVIOUR_ORDER[runB]].color
        ctx.fillRect(x0, runB * rowH + 2, Math.max(1, x1 - x0), rowH - 4)
      }
      let total = 0
      R.forEachRecent(N, (i, k, m) => {
        total = m
        const b = R.behaviour[i]
        if (b !== runB) {
          flush(k, m)
          runB = b
          runStart = k
        }
      })
      flush(total, total)
      const yAxis = BEHAVIOUR_ORDER.length * rowH + 12
      ctx.fillStyle = COLORS.dim
      ctx.font = '10px "IBM Plex Mono", monospace'
      for (let s = 0; s <= WINDOW_S; s += 60) {
        const x = labelW + (1 - s / WINDOW_S) * tw
        ctx.textAlign = s === 0 ? 'right' : s === WINDOW_S ? 'left' : 'center'
        ctx.fillText(s === 0 ? 'now' : `−${s / 60} min`, x, yAxis)
        ctx.fillStyle = COLORS.line
        ctx.fillRect(x - 0.5, 0, 1, BEHAVIOUR_ORDER.length * rowH)
        ctx.fillStyle = COLORS.dim
      }
      ctx.textAlign = 'left'
    },
    { interval: 200 }
  )
  return <canvas className="etho" ref={ref} style={{ height }} />
}

function Trajectory() {
  const ref = useCanvas(
    (ctx, w) => {
      const size = w
      const c = size / 2
      const k = (size / 2 - 6) / ARENA.radius
      ctx.strokeStyle = COLORS.line2
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(c, c, ARENA.radius * k, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([2, 4])
      ctx.strokeStyle = COLORS.line
      ctx.beginPath()
      ctx.arc(c, c, ARENA.radius * 0.5 * k, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      for (const s of sim.substrates) {
        const st = substrateStage(s, sim.t)
        ctx.fillStyle = st === 'mouldy' ? 'rgba(217,120,91,0.35)' : SUBSTRATES[s.type].kind === 'drop' ? 'rgba(124,199,232,0.3)' : 'rgba(224,176,79,0.3)'
        ctx.beginPath()
        ctx.arc(c + s.x * k, c + s.z * k, SUBSTRATES[s.type].radius * k, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#6a4a2a'
      for (const f of sim.frass) ctx.fillRect(c + f.x * k - 1, c + f.z * k - 1, 2, 2)
      const R = sim.recorder
      const N = 120 * RATE_HZ
      let px = null
      let py = null
      R.forEachRecent(N, (i, j, m) => {
        const x = c + R.x[i] * k
        const y = c + R.z[i] * k
        if (px !== null) {
          ctx.strokeStyle = R.y[i] > 0.05 ? `rgba(232,225,207,${0.15 + 0.6 * (j / m)})` : `rgba(79,179,154,${0.1 + 0.8 * (j / m)})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(x, y)
          ctx.stroke()
        }
        px = x
        py = y
      })
      ctx.fillStyle = COLORS.text
      ctx.beginPath()
      ctx.arc(c + sim.fly.x * k, c + sim.fly.z * k, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = COLORS.dim
      ctx.font = '10px "IBM Plex Mono", monospace'
      ctx.fillText('dish: 44 mm', 4, size - 4)
    },
    { interval: 150 }
  )
  return <canvas className="traj" ref={ref} style={{ aspectRatio: '1 / 1' }} />
}

function Budget() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const b = sim.recorder.budget
  const total = b.reduce((s, v) => s + v, 0) || 1
  return (
    <>
      <div className="budget">
        {BEHAVIOUR_ORDER.map((k, i) => (
          <div key={k} style={{ width: `${(b[i] / total) * 100}%`, background: BEHAVIOURS[k].color }} title={BEHAVIOURS[k].label} />
        ))}
      </div>
      <div className="budget-table">
        {BEHAVIOUR_ORDER.map((k, i) => (
          <div key={k}>
            <span><i style={{ background: BEHAVIOURS[k].color }} />{BEHAVIOURS[k].label}</span>
            <b>{((b[i] / total) * 100).toFixed(1)} %</b>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Ethogram() {
  useStore((s) => s.snap.logLength) // re-render when the event log grows
  const distance = useStore((s) => s.snap.distance)
  const t = useStore((s) => s.snap.t)
  const stats = useStore((s) => s.snap.stats)

  const exportCSV = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadText(`virfly-trajectory-${stamp}.csv`, sim.recorder.toCSV(sim.ztAt))
  }
  const exportLog = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const lines = [...sim.log].reverse().map((l) => `${formatClock(l.t)}\t${l.zt}\t${l.text}`)
    downloadText(`virfly-diary-${stamp}.tsv`, `session_time\tclock\tevent\n${lines.join('\n')}`, 'text/tab-separated-values')
  }

  return (
    <>
      <div className="section">
        <div className="section-head">
          <span className="section-title">What it did</span>
          <span className="section-note">last 3 min</span>
        </div>
        <EthogramRaster />
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">How it spent its time</span>
          <span className="section-note">this session, {formatClock(t)}</span>
        </div>
        <Budget />
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Where it went</span>
          <span className="section-note">last 2 min, seen from above</span>
        </div>
        <Trajectory />
        <div className="kv" style={{ marginTop: 10 }}>
          <div><div className="k">Distance</div><div className="v">{(distance / 10).toFixed(1)}<small> cm</small></div></div>
          <div><div className="k">Meals</div><div className="v">{stats.meals}</div></div>
          <div><div className="k">Escapes</div><div className="v">{stats.escapes}</div></div>
        </div>
        <div className="export" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportCSV}><Icon name="download" />Movement data (CSV)</button>
          <button className="btn" onClick={exportLog}><Icon name="download" />Diary</button>
        </div>
        <p className="caption">The CSV file has the fly's position 10 times a second for up to 30 minutes, with its height, direction, speed and what it was doing. It opens in Excel or Google Sheets.</p>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Diary</span>
          <span className="section-note">{sim.log.length} entries</span>
        </div>
        <div className="log">
          {sim.log.slice(0, 40).map((l, i) => (
            <div key={sim.log.length - i} className={l.kind}>
              <span>{formatClock(l.t)}</span>
              <span>{l.zt}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
