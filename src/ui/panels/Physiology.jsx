import { useStore, needHistory } from '../../store'
import { useCanvas, COLORS } from '../canvas'
import { BEHAVIOURS, SUBSTRATES, LEVELS, MAX_LEVEL, MAX_SUBSTRATES } from '../../sim/config'

// The fly's internal state. `invert` turns a deficit (hunger) into a value
// that goes up when things are good (fullness).
const METRICS = [
  { key: 'hunger', label: 'Fullness', invert: true },
  { key: 'thirst', label: 'Water', invert: true },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Mood' },
  { key: 'curiosity', label: 'Curiosity' },
  { key: 'habituation', label: 'Trust in you' },
]

function Spark({ k, invert }) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const arr = needHistory.data[k]
      const n = needHistory.count
      const L = needHistory.length
      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(0, h / 2 + 0.5)
      ctx.lineTo(w, h / 2 + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      if (n < 2) return
      const y = (v) => {
        const val = invert ? 100 - v : v
        return h - 2 - (val / 100) * (h - 4)
      }
      ctx.beginPath()
      for (let i = L - n; i < L; i++) {
        const x = (i / (L - 1)) * w
        i === L - n ? ctx.moveTo(x, y(arr[i])) : ctx.lineTo(x, y(arr[i]))
      }
      const val = invert ? 100 - arr[L - 1] : arr[L - 1]
      ctx.strokeStyle = val < 25 ? '#d9785b' : '#9aa6b0'
      ctx.lineWidth = 1.25
      ctx.stroke()
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.arc(w - 1.5, y(arr[L - 1]), 2, 0, Math.PI * 2)
      ctx.fill()
    },
    { interval: 250 }
  )
  return <canvas ref={ref} />
}

export default function Physiology() {
  const snap = useStore((s) => s.snap)
  const b = BEHAVIOURS[snap.behaviour]
  const level = snap.progression.level
  const next = level < MAX_LEVEL ? LEVELS[level + 1] : null
  const prev = LEVELS[level] ?? 0
  const pct = next ? ((snap.progression.carePoints - prev) / (next - prev)) * 100 : 100

  return (
    <>
      <div className="section">
        <div className="section-head">
          <span className="section-title">Right now</span>
          <span className="section-note">decides 10× a second</span>
        </div>
        <div className="state-now">
          <span className="k">Doing</span>
          <span className="chip"><i style={{ background: b.color }} />{b.label}</span>
          <span className="k">Senses</span>
          <span className="v">{snap.labels.stimulus}</span>
          <span className="k">Brain</span>
          <span className="v">{snap.labels.decision}</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">How it feels</span>
          <span className="section-note">last 4 min</span>
        </div>
        {METRICS.map((m) => {
          const v = m.invert ? 100 - snap.needs[m.key] : snap.needs[m.key]
          return (
            <div className="metric" key={m.key}>
              <span className="label">{m.label}</span>
              <span className="val">{v.toFixed(0)}</span>
              <Spark k={m.key} invert={m.invert} />
            </div>
          )
        })}
        <p className="caption">
          All values are 0 to 100. Hunger and thirst go to the brain's hunger-signal area. Low energy and darkness make it sleepy.
        </p>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Dish</span>
        </div>
        <div className="kv">
          <div><div className="k">Cleanliness</div><div className="v">{snap.hygiene.toFixed(0)}<small> %</small></div></div>
          <div><div className="k">Items</div><div className="v">{snap.substrateCount}<small> / {MAX_SUBSTRATES}</small></div></div>
          <div><div className="k">Droppings</div><div className="v">{snap.frassCount}</div></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Food it likes</span>
          <span className="section-note">−1 dislikes · +1 loves</span>
        </div>
        {Object.values(SUBSTRATES).map((d) => {
          const pi = snap.preferences[d.id] ?? 0
          const left = pi < 0 ? 50 + pi * 50 : 50
          const width = Math.abs(pi) * 50
          return (
            <div className="pi-row" key={d.id}>
              <span className={`label ${d.level > level ? 'locked' : ''}`}>{d.label.split(',')[0]}</span>
              <div className="pi-track">
                <div className="pi-fill" style={{ left: `${left}%`, width: `${width}%`, background: pi < 0 ? '#d9785b' : '#4fb39a' }} />
              </div>
              <span className="val">{pi >= 0 ? '+' : '−'}{Math.abs(pi).toFixed(2)}</span>
            </div>
          )
        })}
        <p className="caption">
          Learned from experience: it likes a food more after each good meal. Give an <b>air puff</b> while it eats and it learns to dislike that food.
        </p>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Care level</span>
          <span className="section-note">level {level}{next ? ` → ${level + 1}` : ' (max)'}</span>
        </div>
        <div className="progress"><div style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
        <p className="caption">
          {snap.progression.carePoints} care points. You earn points when the fly finishes a meal, when you clean the dish and when you run the stripes test. New levels unlock new foods.
          {' '}So far: {snap.stats.meals} meals, {snap.stats.cleaned} items cleaned, {snap.stats.escapes} escapes.
        </p>
      </div>
    </>
  )
}
