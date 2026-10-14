// Runtime half of the brain model.
//
// The data half (src/data/brain-model.json) is produced offline by
// scripts/preprocess_flywire.py from the FlyWire FAFB v783 connectome. This
// file only knows the compressed graph: 15 modules and the summed synapse
// counts between them.
//
// Model: each module carries a rate-like activity a in [0, 1]. Per step,
//   target_i = input_i + g * sum_j w_ji * a_j       (j != i)
//   a_i     <- a_i + k * (target_i - a_i)
// where w_ji is module j's synapse count onto i divided by j's total output,
// signed negative when the edge's dominant transmitter is GABA. Chasing a
// target (rather than accumulating input) keeps steady-state activity near
// the drive magnitude and cannot run away.
//
// Silencing a module clamps its activity to zero, analogous to a
// Shibire-ts or Kir2.1 block in a real experiment: the module still exists
// in the graph but neither responds nor transmits.

const INHIBITORY_NT = new Set(['GABA'])
const RESPONSIVENESS = 0.4
const PROPAGATION_GAIN = 0.5
const HISTORY = 360 // samples kept per module for the trace view

export function createBrainEngine(model) {
  const ids = model.modules.map((m) => m.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const n = ids.length

  const activity = new Float32Array(n).fill(0.02)
  const input = new Float32Array(n)
  const silenced = new Uint8Array(n)
  const history = ids.map(() => new Float32Array(HISTORY))
  let head = 0
  let samples = 0

  // Normalise each source's outgoing weights so that propagation reflects
  // where a module's output goes, not the raw (very uneven) synapse totals.
  const totals = new Float64Array(n)
  for (const e of model.edges) {
    const s = index.get(e.source)
    if (s !== undefined) totals[s] += e.weight
  }
  const edges = []
  for (const e of model.edges) {
    const s = index.get(e.source)
    const t = index.get(e.target)
    if (s === undefined || t === undefined) continue
    edges.push({
      source: e.source,
      target: e.target,
      s,
      t,
      synapses: e.weight,
      nt: e.dominant_nt,
      weight: (e.weight / (totals[s] || 1)) * (INHIBITORY_NT.has(e.dominant_nt) ? -1 : 1),
      self: s === t,
    })
  }
  const crossEdges = edges.filter((e) => !e.self)

  function setInput(id, value) {
    const i = index.get(id)
    if (i !== undefined) input[i] += value
  }

  function step() {
    const prev = Float32Array.from(activity)
    const drive = new Float32Array(n)
    for (const e of crossEdges) {
      const a = prev[e.s]
      if (a > 0.001) drive[e.t] += a * e.weight * PROPAGATION_GAIN
    }
    for (let i = 0; i < n; i++) {
      if (silenced[i]) {
        activity[i] = 0
      } else {
        const target = input[i] + drive[i]
        const next = activity[i] + (target - activity[i]) * RESPONSIVENESS
        activity[i] = next < 0 ? 0 : next > 1 ? 1 : next
      }
      input[i] = 0
      history[i][head] = activity[i]
    }
    head = (head + 1) % HISTORY
    samples = Math.min(HISTORY, samples + 1)
  }

  const get = (id) => {
    const i = index.get(id)
    return i === undefined ? 0 : activity[i]
  }

  return {
    ids,
    modules: model.modules,
    edges,
    dataset: model.dataset,
    coverage: model.coverage,
    note: model.honesty_note,
    setInput,
    step,
    get,
    activityOf: (i) => activity[i],
    isSilenced: (id) => silenced[index.get(id)] === 1,
    setSilenced(id, on) {
      const i = index.get(id)
      if (i === undefined) return
      silenced[i] = on ? 1 : 0
      if (on) activity[i] = 0
    },
    silencedList: () => ids.filter((_, i) => silenced[i]),
    // Copies the trace history for module i, oldest sample first.
    readHistory(i, out) {
      const h = history[i]
      const start = (head - samples + HISTORY) % HISTORY
      for (let k = 0; k < samples; k++) out[k] = h[(start + k) % HISTORY]
      return samples
    },
    historyLength: HISTORY,
    reset() {
      activity.fill(0.02)
      input.fill(0)
    },
  }
}
