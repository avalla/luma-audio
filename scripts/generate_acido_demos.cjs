// Writes the web demo songs as the compact JSON embedded in the native Acido and Studio plugins.
const fs = require('node:fs'), path = require('node:path');
const { demos, defs } = require('../apps/acido/demos.js');
const S = require('../apps/acido/session.js');

const n = v => +v;
const step = s => [s.note, n(s.gate), n(s.accent), n(s.slide), s.octave, s.gateLen, s.hat, n(s.clap), s.vowel, s.bass, s.bassOct, n(s.bassTie), s.snare];
const isDefault = p => p.length === 16 && !p.kicks && !Object.keys(p.auto).length && p.steps.every(s => !s.gate && s.bass < 0 && !s.hat && !s.clap && !s.snare);
function pattern(p, i) {
 const out = { i, length: p.length, steps: p.steps.map(step) };
 if (p.kicks) out.kicks = p.kicks.map(n);
 if (Object.keys(p.auto).length) out.auto = p.auto;
 return out;
}
function song(d, i) {
 return {
  name: d.name, group: defs[i].group || 'acid', scale: defs[i].scale, tempo: d.tempo, swing: d.swing, current: d.current, chain: d.chain, params: d.params,
  patterns: d.patterns.flatMap((p, at) => isDefault(p) ? [] : [pattern(p, at)]),
  song: { on: d.song.on, sections: d.song.sections.map(x => ({ name: x.name, patterns: x.patterns, repeat: x.repeat, mute: S.MUTES.map(id => n(x.mute[id])) })) }
 };
}
const text = `${JSON.stringify({ version: 1, songs: demos.map(song) })}\n`;
const file = path.join(__dirname, '../plugins/acido-core/demos.json');
if (process.argv.includes('--check')) {
 if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) { /* Windows checkouts may use CRLF */ console.error('plugins/acido-core/demos.json is stale: run bun scripts/generate_acido_demos.cjs'); process.exit(1); }
 console.log('demos.json is current');
} else {
 fs.writeFileSync(file, text);
 console.log(`Wrote ${demos.length} songs, ${(text.length / 1024).toFixed(0)} KB`);
}
