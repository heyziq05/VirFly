import { sim, useStore } from '../store'
import { SUBSTRATES, STIMULI } from '../sim/config'

const SWATCH = { banana: '#eadc9f', water: '#9fd3ea', sucrose: '#efe5c4', apple: '#b8322a', yeast: '#cfb17a', grape: '#5b2a4c' }

function Tool({ name, sub, kbd, active, disabled, onClick, swatch, title }) {
  return (
    <button className={`tool ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick} title={title}>
      <span className="name">
        {swatch && <span className="swatch" style={{ background: swatch }} />}
        {name}
      </span>
      <span className="sub">
        <span>{sub}</span>
        {kbd && <kbd>{kbd}</kbd>}
      </span>
    </button>
  )
}

export default function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const level = useStore((s) => s.snap.progression.level)
  const drum = useStore((s) => s.snap.drum)
  const lightMode = useStore((s) => s.snap.lightMode)
  const camera = useStore((s) => s.camera)
  const toggleCamera = useStore((s) => s.toggleCamera)
  const trail = useStore((s) => s.trail)
  const toggleTrail = useStore((s) => s.toggleTrail)
  const frass = useStore((s) => s.snap.frassCount)
  const hand = useStore((s) => s.hand)
  const toggleHand = useStore((s) => s.toggleHand)
  const held = useStore((s) => s.snap.behaviour === 'held')

  return (
    <div className="toolbar">
      <div className="tgroup">
        <div className="tgroup-label">Food &amp; water</div>
        <div className="tgroup-row">
          {Object.values(SUBSTRATES).map((d, i) => {
            const locked = d.level > level
            return (
              <Tool
                key={d.id}
                name={d.label.split(/[ ,]/)[0]}
                sub={locked ? `level ${d.level}` : d.short}
                kbd={String(i + 1)}
                swatch={SWATCH[d.id]}
                active={tool === d.id}
                disabled={locked}
                title={locked ? `${d.label}: unlocks at care level ${d.level}` : `${d.label}. Click the dish floor to place it. Hold Shift to place more than one.`}
                onClick={() => setTool(d.id)}
              />
            )
          })}
        </div>
      </div>

      <div className="tgroup">
        <div className="tgroup-label">Care</div>
        <div className="tgroup-row">
          <Tool
            name="Hold fly"
            sub={held ? 'holding' : hand ? 'on' : 'off'}
            kbd="G"
            active={hand}
            onClick={toggleHand}
            title="When on, press and hold the fly to pick it up, drag it, and let go to put it down."
          />
          <Tool name="Clean" sub={`${frass} dropping${frass === 1 ? '' : 's'}`} kbd="C" active={tool === 'clean'} onClick={() => setTool('clean')} title="Click droppings or mouldy fruit to remove them. X cleans the nearest." />
        </div>
      </div>

      <div className="tgroup">
        <div className="tgroup-label">Tests</div>
        <div className="tgroup-row">
          <Tool name={STIMULI.puff.label} sub="startle" kbd="Q" onClick={() => sim.stimulate('puff')} title={STIMULI.puff.note} />
          <Tool name={STIMULI.loom.label} sub="scare" kbd="W" onClick={() => sim.stimulate('loom')} title={STIMULI.loom.note} />
          <Tool name={STIMULI.drum.label} sub={drum ? 'on' : 'off'} kbd="E" active={drum} onClick={() => sim.stimulate('drum')} title={STIMULI.drum.note} />
        </div>
      </div>

      <div className="tgroup">
        <div className="tgroup-label">Light</div>
        <div className="tgroup-row">
          {[['auto', '12 h / 12 h'], ['on', 'always'], ['off', 'always']].map(([m, sub]) => (
            <Tool key={m} name={m === 'auto' ? 'Day/night' : m === 'on' ? 'On' : 'Off'} sub={sub} active={lightMode === m} onClick={() => sim.setLightMode(m)} kbd={m === 'auto' ? 'L' : null} />
          ))}
        </div>
      </div>

      <div className="tgroup">
        <div className="tgroup-label">View</div>
        <div className="tgroup-row">
          <Tool name={camera === 'track' ? 'Follow fly' : 'Whole dish'} sub="camera" kbd="V" onClick={toggleCamera} />
          <Tool name="Path" sub={trail ? 'last 20 s' : 'hidden'} kbd="T" active={trail} onClick={toggleTrail} title="Show where the fly walked recently" />
        </div>
      </div>
    </div>
  )
}
