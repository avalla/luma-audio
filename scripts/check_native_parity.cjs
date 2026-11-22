// Compares native renders with the web engine. Usage: bun scripts/check_native_parity.cjs <folder with acido-*.f32 and studio-*.f32>
const fs = require('node:fs'), path = require('node:path');
const { Engine } = require('../apps/acido/engine.js'), { Sequencer } = require('../apps/acido/sequencer.js'), { demos, defs } = require('../apps/acido/demos.js');
const { OrbitLayer, buildTimeline } = require('../apps/studio/orbit-layer.js'), { Mixer } = require('../apps/studio/mixer.js'), Flow = require('../apps/orbit/flow.js');
const dir = process.argv[2], SR = 44100, SECONDS = 6, LIMIT = 1e-3;
if (!dir) throw new Error('Pass the folder with the native renders');

function render(d, i, studio) {
 const state = JSON.parse(JSON.stringify(d)), e = new Engine(SR), q = new Sequencer(SR);
 e.sequence = q; e.setParams(state.params);
 if (studio) {
  const l = new OrbitLayer(SR), m = new Mixer(SR), t = buildTimeline(Flow, { notes: [0, 4, 2, 6, 4, 7, 2, 3], amount: .35, seed: 3 });
  e.layer = l; e.mixer = m; l.level = .55; l.setScale(defs[i].scale); l.setPhrase(t.deg, t.beats);
  m.setStrip(0, { pan: -.2, delay: .3, reverb: .3 }); m.setStrip(1, { pan: .4, delay: .1, reverb: .12 });
  m.setStrip(4, { reverb: .24 }); m.setStrip(6, { reverb: .24 }); m.setStrip(5, { mute: true });
 }
 q.configure(state); q.select(state.current); e.tempo = q.tempo; e.reset(); q.start(e);
 const n = SR * SECONDS, L = new Float32Array(n), R = new Float32Array(n);
 for (let at = 0; at < n; at += 128) { const c = Math.min(128, n - at); e.process(L.subarray(at, at + c), R.subarray(at, at + c), c); }
 return { L, R };
}
let worst = 0, failed = 0;
for (const studio of [false, true]) demos.forEach((d, i) => {
 const file = path.join(dir, `${studio ? 'studio' : 'acido'}-${i}.f32`), raw = fs.readFileSync(file);
 const native = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), { L, R } = render(d, i, studio);
 if (native.length !== L.length * 2) throw new Error(`${file}: wrong length ${native.length}`);
 let max = 0, at = 0;
 for (let n = 0; n < L.length; n++) { const x = Math.max(Math.abs(native[n * 2] - L[n]), Math.abs(native[n * 2 + 1] - R[n])); if (x > max) { max = x; at = n; } }
 worst = Math.max(worst, max);
 if (max > LIMIT) { failed++; console.error(`${studio ? 'Studio' : 'Acido'} / ${d.name}: difference ${max.toExponential(2)} at sample ${at}`); }
});
if (failed) process.exit(1);
console.log(`PASS: ${demos.length * 2} native renders match the web engine, largest sample difference ${worst.toExponential(2)}`);
