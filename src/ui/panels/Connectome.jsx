import { useEffect, useMemo, useState } from 'react'
import { sim, useStore } from '../../store'
import { useCanvas, COLORS } from '../canvas'

// Plain names for the 15 brain areas. The scientific names (from the
// FlyWire data) are shown in the detail card.
export const SHORT = {
  olfactory_al: 'Smell',
  gustatory: 'Taste',
  visual: 'Vision',
  mechanosensory: 'Touch/humidity',
  lateral_horn: 'Instinct',
  mb_kenyon: 'Memory',
  mb_dan: 'Reward',
  mb_output: 'Learned choice',
  cx_navigation: 'Navigation',
  cx_sleep: 'Sleep drive',
  neurosecretory: 'Hunger signals',
  integration_hub: 'Integration',
  arousal_stress: 'Alarm',
  descending_motor: 'Movement',
  feeding_motor: 'Feeding',
}

// One-sentence plain explanation of each area.
const PLAIN = {
  olfactory_al: 'Where smells picked up by the antennae are first processed.',
  gustatory: 'Taste. Switches on when the fly touches food with its mouth or feet.',
  visual: 'The large vision areas behind the eyes. They detect light, movement and shadows.',
  mechanosensory: 'Senses touch, wind and how damp the air is. This is how the fly finds water.',
  lateral_horn: 'Built-in likes and dislikes for smells, for example "mould is bad". No learning needed.',
  mb_kenyon: 'Part of the mushroom body, the fly\'s learning and memory centre. Stores which smell is which.',
  mb_dan: 'Dopamine cells that mark experiences as good (a meal) or bad (an air puff), so they can be remembered.',
  mb_output: 'Reads the memory and nudges the fly toward things it liked before and away from things it disliked.',
  cx_navigation: 'Part of the central complex. Keeps track of direction and helps steer.',
  cx_sleep: 'A part of the central complex linked to sleep. Builds up with tiredness and darkness.',
  neurosecretory: 'A small group of hormone cells. The closest thing the fly has to a hunger and thirst centre.',
  integration_hub: 'Areas where many senses come together. Used here as the source of curiosity.',
  arousal_stress: 'Octopamine cells, the fly\'s version of an adrenaline ("fight or flight") system.',
  descending_motor: 'Cells that carry commands from the brain down to the legs and wings.',
  feeding_motor: 'Nerve cells that move the mouthpart (proboscis) to eat and drink.',
}

const CATEGORY = { sensory: 'Senses', associative: 'Learning', state: 'Body state', motor: 'Action' }

const LAYOUT = {
  olfactory_al: [42, 58], gustatory: [42, 128], visual: [42, 198], mechanosensory: [42, 268],
  lateral_horn: [140, 48], mb_kenyon: [140, 118], mb_dan: [140, 188], mb_output: [140, 258],
  cx_navigation: [238, 36], cx_sleep: [238, 96], neurosecretory: [238, 156], integration_hub: [238, 216], arousal_stress: [238, 276],
  descending_motor: [332, 118], feeding_motor: [332, 218],
}
const COLUMNS = [[42, 'Senses'], [140, 'Learning'], [238, 'Body state'], [332, 'Action']]

export const NT = {
  ACH: { label: 'Acetylcholine', color: '#7fa7c9' },
  GLUT: { label: 'Glutamate', color: '#b58ad6' },
  GABA: { label: 'GABA (calming)', color: '#d9785b' },
  DA: { label: 'Dopamine', color: '#e0b04f' },
  OCT: { label: 'Octopamine', color: '#d96b8a' },
  SER: { label: 'Serotonin', color: '#4fb39a' },
}

function activityColor(a) {
  // Sequential ramp: panel -> teal -> pale.
  const stops = [[26, 30, 34], [42, 110, 96], [79, 179, 154], [216, 243, 234]]
  const x = Math.max(0, Math.min(0.999, a)) * (stops.length - 1)
  const i = Math.floor(x)
  const t = x - i
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function formatSynapses(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`
  return String(n)
}

function useTick(ms) {
  const [, set] = useState(0)
  useEffect(() => {
    const id = setInterval(() => set((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

function Graph({ selected, onSelect }) {
  useTick(100)
  const B = sim.brain
  const edges = useMemo(
    () => B.edges.filter((e) => !e.self && Math.abs(e.weight) > 0.025).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 64),
    [B]
  )
  return (
    <svg className="graph" viewBox="0 0 372 304" role="img" aria-label="Map of brain areas with live activity">
      {COLUMNS.map(([x, label]) => (
        <text key={label} className="col" x={x} y={10} textAnchor="middle">{label}</text>
      ))}
      <g>
        {edges.map((e, i) => {
          const [x1, y1] = LAYOUT[e.source]
          const [x2, y2] = LAYOUT[e.target]
          const a = B.get(e.source)
          const hl = selected && (e.source === selected || e.target === selected)
          const dim = selected && !hl
          const bend = x1 === x2 ? 34 * Math.sign(y2 - y1 || 1) : (y2 - y1) * 0.12 + (x2 < x1 ? 18 : -10)
          const mx = (x1 + x2) / 2 + (x1 === x2 ? bend : 0)
          const my = (y1 + y2) / 2 + (x1 === x2 ? 0 : bend)
          return (
            <path
              key={i}
              d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
              fill="none"
              stroke={NT[e.nt]?.color ?? '#888'}
              strokeWidth={0.5 + 3.2 * Math.sqrt(Math.abs(e.weight))}
              strokeOpacity={dim ? 0.04 : Math.min(0.9, 0.1 + (hl ? 0.35 : 0) + 0.85 * a)}
              strokeLinecap="round"
            />
          )
        })}
      </g>
      {B.modules.map((m) => {
        const [x, y] = LAYOUT[m.id]
        const a = B.get(m.id)
        const silenced = B.isSilenced(m.id)
        const r = 5 + 2.1 * Math.log10(m.neuron_count)
        const sel = selected === m.id
        return (
          <g key={m.id} className="node" transform={`translate(${x},${y})`} onClick={() => onSelect(sel ? null : m.id)}>
            <circle r={r + 6} fill="transparent" />
            <circle className="ring" r={r} fill={silenced ? '#121416' : activityColor(a)} stroke={silenced ? '#d9785b' : sel ? '#e8ecef' : '#3a4147'} strokeWidth={sel ? 1.6 : 1} strokeDasharray={silenced ? '2 2' : undefined} />
            {silenced && <line x1={-r * 0.7} y1={r * 0.7} x2={r * 0.7} y2={-r * 0.7} stroke="#d9785b" strokeWidth={1.2} />}
            <text y={r + 11} textAnchor="middle" style={{ fill: sel ? '#d8dcdf' : undefined }}>{SHORT[m.id]}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Traces({ selected }) {
  const B = sim.brain
  const buf = useMemo(() => new Float32Array(B.historyLength), [B])
  const rowH = 17
  const height = B.ids.length * rowH + 18
  const ref = useCanvas((ctx, w) => {
    const labelW = 96
    const tw = w - labelW - 4
    ctx.font = '10.5px "IBM Plex Sans", sans-serif'
    ctx.textBaseline = 'middle'
    B.ids.forEach((id, i) => {
      const y0 = i * rowH
      const sel = id === selected
      if (sel) {
        ctx.fillStyle = 'rgba(79,179,154,0.08)'
        ctx.fillRect(0, y0, w, rowH)
      }
      ctx.fillStyle = sel ? COLORS.text : COLORS.muted
      ctx.fillText(SHORT[id], 0, y0 + rowH / 2)
      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(labelW, y0 + rowH - 0.5)
      ctx.lineTo(w, y0 + rowH - 0.5)
      ctx.stroke()
      if (B.isSilenced(id)) {
        ctx.fillStyle = '#d9785b'
        ctx.fillText('switched off', labelW + 6, y0 + rowH / 2)
        return
      }
      const n = B.readHistory(i, buf)
      const L = B.historyLength
      ctx.beginPath()
      for (let k = 0; k < n; k++) {
        const x = labelW + ((L - n + k) / (L - 1)) * tw
        const y = y0 + rowH - 2 - Math.min(1, buf[k]) * (rowH - 4)
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.strokeStyle = sel ? '#8fe0c8' : COLORS.accent
      ctx.lineWidth = sel ? 1.4 : 1
      ctx.stroke()
    })
    const yAxis = B.ids.length * rowH + 11
    ctx.fillStyle = COLORS.dim
    ctx.font = '10px "IBM Plex Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`−${(B.historyLength / 10).toFixed(0)} s`, labelW, yAxis)
    ctx.textAlign = 'right'
    ctx.fillText('now', w, yAxis)
    ctx.textAlign = 'left'
  })
  return <canvas className="traces" ref={ref} style={{ height }} />
}

function ModuleCard({ id }) {
  useTick(250)
  const B = sim.brain
  const m = B.modules.find((q) => q.id === id)
  const silenced = B.isSilenced(id)
  const inputs = B.edges.filter((e) => e.target === id && !e.self).sort((a, b) => b.synapses - a.synapses).slice(0, 3)
  const outputs = B.edges.filter((e) => e.source === id && !e.self).sort((a, b) => b.synapses - a.synapses).slice(0, 3)
  const recurrent = B.edges.find((e) => e.source === id && e.self)
  return (
    <div className="module-card">
      <div className="cat">{CATEGORY[m.category] ?? m.category} · main chemical: {NT[m.dominant_neurotransmitter]?.label ?? m.dominant_neurotransmitter}</div>
      <h4>{SHORT[id]}</h4>
      <div className="sci">{m.label}</div>
      <p>{PLAIN[id] ?? m.desc}</p>
      <table>
        <tbody>
          <tr><td>Nerve cells</td><td>{m.neuron_count.toLocaleString()}</td></tr>
          <tr><td>Links inside this area</td><td>{recurrent ? formatSynapses(recurrent.synapses) : '—'}</td></tr>
          <tr><td>Activity now</td><td>{silenced ? 'switched off' : `${(B.get(id) * 100).toFixed(0)} %`}</td></tr>
          <tr><td colSpan={2} className="th">Strongest connections (number of synapses)</td></tr>
          {inputs.map((e) => (
            <tr key={'i' + e.source}><td>from {SHORT[e.source]}</td><td title={NT[e.nt]?.label}>{formatSynapses(e.synapses)} links</td></tr>
          ))}
          {outputs.map((e) => (
            <tr key={'o' + e.target}><td>to {SHORT[e.target]}</td><td title={NT[e.nt]?.label}>{formatSynapses(e.synapses)} links</td></tr>
          ))}
        </tbody>
      </table>
      {m.sample_neurons?.length > 0 && (
        <div className="ids">
          <div className="ids-title">Example cells (FlyWire ID · cell type)</div>
          {m.sample_neurons.slice(0, 4).map((n) => (
            <div key={n.root_id}>
              <span>{n.root_id}</span>
              <span>{n.cell_type || n.name} · {n.nt_type}</span>
            </div>
          ))}
        </div>
      )}
      <div className="module-actions">
        <button className={`btn ${silenced ? 'on' : ''}`} onClick={() => {
          sim.silence(id, !silenced)
          useStore.getState().refresh()
        }}>
          {silenced ? 'Switch back on' : 'Switch off this area'}
        </button>
      </div>
    </div>
  )
}

export default function Connectome() {
  const selected = useStore((s) => s.selectedModule)
  const select = useStore((s) => s.selectModule)
  const silenced = useStore((s) => s.snap.silenced)
  const c = sim.brain.coverage
  return (
    <>
      <div className="section">
        <div className="section-head">
          <span className="section-title">Brain map</span>
          <span className="section-note">FAFB v783</span>
        </div>
        <Graph selected={selected} onSelect={select} />
        <div className="legend">
          {Object.entries(NT).map(([k, v]) => (
            <span key={k}><i style={{ background: v.color }} />{v.label}</span>
          ))}
        </div>
        <p className="caption">
          The fly's {c.neurons_in_displayed_modules.toLocaleString()} mapped nerve cells, grouped into 15 brain areas.
          Bigger circles have more cells. Brighter circles are more active right now. Lines are the 64 strongest
          connections, coloured by the chemical they use. Click an area to learn about it or switch it off.
        </p>
      </div>

      {selected && (
        <div className="section">
          <ModuleCard id={selected} />
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <span className="section-title">Activity over time</span>
          <span className="section-note">{silenced.length ? `${silenced.length} switched off` : 'all areas on'}</span>
        </div>
        <Traces selected={selected} />
        <p className="caption">How active each area has been over the last 36 seconds. These come from the model, not from recordings of a real fly.</p>
      </div>
    </>
  )
}
