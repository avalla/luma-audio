const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./session.js'),{demos,defs,pitch}=require('./demos.js'),{renderState,musicFrames}=require('./render.js'),T=require('./tools.js');
const tokens=b=>b.trim().split(/\s+/).filter(t=>!['.','-'].includes(t));

test('demos are complete songs with lead, bass, drums and sections',()=>{
 assert.equal(demos.length,15);assert.equal(new Set(demos.map(d=>d.name)).size,15);
 for(const d of demos){
  assert.deepEqual(S.validate(JSON.parse(JSON.stringify(d))),d,d.name);
  assert.ok(d.song.on&&d.song.sections.length>=6,d.name);
  const used=[...new Set(d.song.sections.flatMap(x=>x.patterns))];
  assert.ok(used.every(i=>d.patterns[i].steps.some(s=>s.gate||s.bass>=0)),d.name);
  const all=used.flatMap(i=>d.patterns[i].steps);
  assert.ok(all.some(s=>s.gate)&&all.some(s=>s.bass>=0)&&all.some(s=>s.hat)&&all.some(s=>s.clap),d.name);
  assert.ok(used.some(i=>d.patterns[i].auto.cutoff),`${d.name} has a filter build`);
 }
});
test('every melody note belongs to the key of its song',()=>{
 for(const d of defs)for(const b of [...d.leadA,...d.leadB])for(const t of tokens(b))assert.ok(d.scale.includes(pitch(t)%12),`${d.name}: ${t}`);
});
test('demos render clean and audible, with the bass present',()=>{
 for(const d of demos){
  const {L,R}=renderState(d,{sampleRate:22050,loops:1});
  let e=0,peak=0;for(let i=0;i<L.length;i++){assert.ok(Number.isFinite(L[i])&&Number.isFinite(R[i]));e+=L[i]*L[i];peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));}
  const rms=Math.sqrt(e/L.length);
  assert.ok(peak<=.95,`${d.name} peak ${peak}`);assert.ok(rms>.08&&rms<.5,`${d.name} rms ${rms}`);
  const seconds=musicFrames(d,1,22050)/22050;assert.ok(seconds>60&&seconds<180,`${d.name} ${seconds}s`);
 }
});
test('glitch songs have a broken groove and the effect really changes the audio',()=>{
 const list=defs.map((d,i)=>[d,demos[i]]).filter(([d])=>d.group==='glitch');assert.equal(list.length,4);
 for(const [d,song] of list){
  assert.ok(song.params.glitch>0,d.name);
  const clean=S.validate({...JSON.parse(JSON.stringify(song)),params:{...song.params,glitch:0,crush:0}});
  const a=renderState(song,{sampleRate:22050,loops:1}).L,b=renderState(clean,{sampleRate:22050,loops:1}).L;
  let diff=0,e=0;for(let i=0;i<a.length;i++){diff+=(a[i]-b[i])**2;e+=b[i]*b[i];}
  assert.ok(diff/e>.05,`${d.name} glitch effect ${diff/e}`);
  assert.deepEqual(a,renderState(song,{sampleRate:22050,loops:1}).L,`${d.name} is deterministic`);
 }
});
test('vocal songs sing changing vowels on every part of the melody',()=>{
 const list=defs.map((d,i)=>[d,demos[i]]).filter(([d])=>d.group==='voci');assert.equal(list.length,5);
 for(const [d,song] of list){
  assert.ok(song.params.formant>=.85,d.name);
  const used=[...new Set(song.song.sections.flatMap(x=>x.patterns))],gated=used.flatMap(i=>song.patterns[i].steps).filter(s=>s.gate);
  assert.ok(gated.filter(s=>s.vowel>=0).length/gated.length>.9,`${d.name} sung steps`);
  assert.equal(new Set(gated.map(s=>s.vowel).filter(v=>v>=0)).size,5,`${d.name} uses all vowels`);
  const dry=S.validate({...JSON.parse(JSON.stringify(song)),params:{...song.params,formant:0}});
  const a=renderState(song,{sampleRate:22050,loops:1}).L,b=renderState(dry,{sampleRate:22050,loops:1}).L;
  let diff=0,e=0;for(let i=0;i<a.length;i++){diff+=(a[i]-b[i])**2;e+=b[i]*b[i];}
  assert.ok(diff/e>.05,`${d.name} formant effect ${diff/e}`);
 }
});
test('demos fit in a share link',async()=>{
 for(const d of demos){
  const code=await T.encodeState(d),back=await T.decodeState(code);
  assert.deepEqual(back.song,d.song);assert.ok(code.length<6000,`${d.name} ${code.length}`);
 }
});
