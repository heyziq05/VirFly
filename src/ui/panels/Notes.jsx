import { useState } from 'react'
import { sim, resetSession } from '../../store'

export default function Notes() {
  const [confirm, setConfirm] = useState(false)
  const c = sim.brain.coverage
  const d = sim.brain.dataset
  const cross = sim.brain.edges.filter((e) => !e.self).length

  return (
    <article className="notes">
      <h2>A virtual fruit fly with a real brain map</h2>
      <div className="byline">Project notes · VirFly v1.0 by heyziq05</div>

      <h3>In short</h3>
      <p>
        VirFly is one fruit fly (<i>Drosophila melanogaster</i>) living in a small glass dish. You look after it like a
        pet: give it food and water, clean the dish, and try things on it like a puff of air or a passing shadow.
      </p>
      <p>
        What makes it different is how the fly decides what to do. Its "brain" is a small model built from a real,
        complete map of a fruit fly's brain, published by the FlyWire project. Everything you do reaches the fly as
        something it senses, and what it does next comes from that brain model, not from a script.
      </p>

      <h3>Where the brain data comes from</h3>
      <p>
        FlyWire scientists traced every nerve cell (neuron) in one adult female fly's brain from electron-microscope
        images, and recorded which cells connect to which. This project uses their public release:
        {' '}{d.name} {d.version}.
      </p>
      <div className="stat"><span>Neurons in the map</span><b>{c.total_traced_neurons.toLocaleString()}</b></div>
      <div className="stat"><span>Neurons used here</span><b>{c.neurons_in_displayed_modules.toLocaleString()} ({c.neurons_in_displayed_modules_pct} %)</b></div>
      <div className="stat"><span>Connections read</span><b>{c.total_raw_connections_considered.toLocaleString()}</b></div>
      <div className="stat"><span>Connections kept</span><b>{c.connections_retained_module_to_module.toLocaleString()}</b></div>
      <div className="stat" style={{ marginBottom: 10 }}><span>Links between brain areas</span><b>{cross} (+ {sim.brain.edges.length - cross} inside an area)</b></div>
      <p>
        Simulating 139,000 neurons one by one would be far too slow for a browser. So the script
        {' '}<code>scripts/preprocess_flywire.py</code> sorts every neuron into one of 15 <b>brain areas</b> (smell,
        vision, memory, sleep and so on), using the labels FlyWire gives each cell. It then counts how many connections
        run from each area to each other area. Those counts become the strength of the links in the model.
      </p>

      <h3>How the brain model works</h3>
      <p>Each brain area has an activity level between 0 (quiet) and 1 (fully active). Ten times a second, every area is updated like this:</p>
      <div className="eq">
        <i>a</i><sub>i</sub> ← clamp<sub>[0, 1]</sub>( <i>a</i><sub>i</sub> + <i>k</i> · ( <i>u</i><sub>i</sub> + <i>g</i> · Σ<sub>j</sub> <i>w</i><sub>ji</sub> <i>a</i><sub>j</sub> − <i>a</i><sub>i</sub> ) )
      </div>
      <ul>
        <li><i>a</i><sub>i</sub> is the current activity of area <i>i</i>.</li>
        <li><i>u</i><sub>i</sub> is what the area receives from the outside world, such as a smell, darkness or hunger.</li>
        <li><i>w</i><sub>ji</sub> is how strongly area <i>j</i> connects to area <i>i</i>. It is area <i>j</i>'s share of connections going to <i>i</i>, taken from the FlyWire counts. Links that use the calming chemical GABA count as negative, so they lower activity.</li>
        <li><i>k</i> = 0.4 sets how fast an area reacts. Each update closes 40 % of the gap to where it is heading.</li>
        <li><i>g</i> = 0.5 sets how strongly areas pass activity to each other.</li>
        <li>clamp keeps the result between 0 and 1.</li>
      </ul>
      <p>
        In plain words: each area slowly moves toward "what it is being told", which is its outside input plus
        the signal from the areas connected to it.
      </p>
      <p>
        This is not a new formula. It is a standard firing-rate model with a leak (it settles back down when the input
        stops), as taught in computational neuroscience (Dayan &amp; Abbott, 2001, ch. 7). The idea came from the first
        version of this project. Only the link strengths <i>w</i> come from real data. The values of <i>k</i> and
        {' '}<i>g</i> were chosen by hand so the fly behaves sensibly in the game, and were not measured from real flies.
      </p>

      <h3>From the dish to the brain</h3>
      <ul>
        <li>Food gives off a smell that gets weaker with distance. Overripe fruit smells stronger (flies love it). Mouldy fruit triggers an instinct to stay away.</li>
        <li>The fly finds water by feeling the humidity around it.</li>
        <li>Hunger and thirst build up over time and feed the "hunger signals" area.</li>
        <li>Tiredness, darkness and a midday nap urge feed the "sleep drive" area.</li>
        <li>A puff of air or a brush touch feeds the touch area and the alarm area. A looming shadow feeds vision.</li>
        <li>When the fly touches food, the taste area switches on, and that drives the feeding muscles.</li>
      </ul>

      <h3>From the brain to behaviour</h3>
      <p>
        Ten times a second the fly picks one action, checking in this order: escape if the alarm and a sense are
        both high, sleep if sleep drive is high, keep eating, stay away from mould, walk toward food it can smell,
        follow moving stripes, or otherwise wander, pause or clean itself.
      </p>
      <p>
        You can switch off any brain area in the Brain tab. Scientists do the same thing with genetic tools (for
        example Kir2.1 or <i>shibire</i><sup>ts</sup>). Each one has an effect you can see:
      </p>
      <ul>
        <li>Switch off <b>smell</b> and the fly can no longer find fruit.</li>
        <li>Switch off <b>movement</b> and it stops moving.</li>
        <li>Switch off <b>feeding</b> and it reaches food but cannot eat.</li>
        <li>Switch off <b>vision</b> and the shadow no longer scares it.</li>
      </ul>
      <p>
        <b>Learning:</b> after a good meal the fly likes that food a bit more. If you puff air at it while it eats,
        it learns to dislike that food, a simple version of a classic fly memory experiment.
      </p>

      <h3>How it is drawn</h3>
      <p>
        The fly is built in code at its real size (about 2.6 mm long). It has red compound eyes made of tiny facets,
        clear veined wings with a rainbow sheen, a striped body and fine bristles. It walks on six legs, moving three at
        a time as real flies do. In flight the wings blur, as they would on camera. At night the view switches to
        a black-and-white infrared camera, the kind used in real sleep studies.
      </p>

      <h3>What this model cannot do</h3>
      <ul>
        <li>15 brain areas is a huge simplification of 139,000 neurons. This is a model <i>shaped by</i> the real wiring, not a copy of the real brain.</li>
        <li>Only GABA links count as calming. In real flies some glutamate links also calm, and chemicals such as dopamine work in more complex ways.</li>
        <li>How the world turns into brain inputs, and the thresholds for picking an action, were set by hand.</li>
        <li>Time is sped up: a full day and night lasts only 4 minutes, so sleep periods are much shorter than in real flies.</li>
      </ul>

      <h3>References</h3>
      <p className="ref">Dorkenwald, S. et al. (2024). Neuronal wiring diagram of an adult brain. <i>Nature</i> 634, 124–138.</p>
      <p className="ref">Schlegel, P. et al. (2024). Whole-brain annotation and multi-connectome cell typing of <i>Drosophila</i>. <i>Nature</i> 634, 139–152.</p>
      <p className="ref">Eckstein, N. et al. (2024). Neurotransmitter classification from electron microscopy images at synaptic sites in <i>Drosophila melanogaster</i>. <i>Cell</i> 187, 2574–2594.</p>
      <p className="ref">Dayan, P. &amp; Abbott, L. F. (2001). <i>Theoretical Neuroscience: Computational and Mathematical Modeling of Neural Systems</i>, ch. 7. MIT Press.</p>
      <p className="ref">Card, G. &amp; Dickinson, M. H. (2008). Visually mediated motor planning in the escape response of <i>Drosophila</i>. <i>Curr. Biol.</i> 18, 1300–1307.</p>
      <p className="ref">Reiser, M. B. &amp; Dickinson, M. H. (2008). A modular display system for insect behavioral neuroscience. <i>J. Neurosci. Methods</i> 167, 127–139.</p>
      <p className="ref">Shaw, P. J. et al. (2000). Correlates of sleep and waking in <i>Drosophila melanogaster</i>. <i>Science</i> 287, 1834–1837.</p>
      <p className="ref">Hendricks, J. C. et al. (2000). Rest in <i>Drosophila</i> is a sleep-like state. <i>Neuron</i> 25, 129–138.</p>
      <p className="ref">Tully, T. &amp; Quinn, W. G. (1985). Classical conditioning and retention in normal and mutant <i>Drosophila melanogaster</i>. <i>J. Comp. Physiol. A</i> 157, 263–277.</p>
      <p className="ref">Becher, P. G. et al. (2012). Yeast, not fruit volatiles mediate <i>Drosophila melanogaster</i> attraction, oviposition and development. <i>Funct. Ecol.</i> 26, 822–828.</p>
      <p className="ref">Seeds, A. M. et al. (2014). A suppression hierarchy among competing motor programs drives sequential grooming in <i>Drosophila</i>. <i>eLife</i> 3, e02951.</p>
      <p className="ref">Kitamoto, T. (2001). Conditional modification of behavior in <i>Drosophila</i> by targeted expression of a temperature-sensitive <i>shibire</i> allele in defined neurons. <i>J. Neurobiol.</i> 47, 81–92.</p>
      <p className="ref">Branson, K. et al. (2009). High-throughput ethomics in large groups of <i>Drosophila</i>. <i>Nat. Methods</i> 6, 451–457.</p>

      <h3>Your session</h3>
      <p>Your progress is saved in this browser every few seconds.</p>
      {confirm ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn danger" onClick={resetSession}>Yes, start over</button>
          <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirm(true)}>Start a new session…</button>
      )}
    </article>
  )
}
