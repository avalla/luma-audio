const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../acido/session.js'),{Engine}=require('../acido/engine.js'),{Sequencer}=require('../acido/sequencer.js'),{renderState}=require('../acido/render.js'),{demos,defs}=require('../acido/demos.js'),Flow=require('../orbit/flow.js');
const {OrbitLayer,SOUNDS,buildTimeline}=require('./orbit-layer.js');
const NOTES=[0,4,2,6,4,7,2,3],SR=22050;
const timeline=(seed=3,amount=.35)=>buildTimeline(Flow,{notes:NOTES,amount,seed});
function studio(d,{level=.55,send=.3,sound='glass',lead=1,sr=SR,seconds=8,duck}={}){
 const e=new Engine(sr),q=new Sequencer(sr),l=new OrbitLayer(sr),state=JSON.parse(JSON.stringify(d));
 if(duck!==undefined)state.params.duck=duck;
 e.sequence=q;e.layer=l;e.leadLevel=lead;e.setParams(state.params);q.configure(state);q.select(0);e.tempo=q.tempo;e.reset();
 l.level=level;l.send=send;l.setSound(sound);l.setScale(defs[demos.indexOf(d)].scale);const t=timeline();l.setPhrase(t.deg,t.beats);q.start(e);
 const n=Math.round(seconds*sr),L=new Float32Array(n),R=new Float32Array(n);
 for(let at=0;at<n;at+=128){const c=Math.min(128,n-at);e.process(L.subarray(at,at+c),R.subarray(at,at+c),c);}
 return {L,R,e,q,l};
}
const rms=a=>{let x=0;for(const v of a)x+=v*v;return Math.sqrt(x/a.length);};

test('without a layer the Acido engine is unchanged',()=>{
 const d=demos[0],plain=renderState(d,{sampleRate:SR,loops:1}).L;
 const e=new Engine(SR),q=new Sequencer(SR);e.sequence=q;e.leadLevel=1;e.setParams(d.params);q.configure(JSON.parse(JSON.stringify(d)));q.select(d.current);e.tempo=q.tempo;e.reset();q.start(e);
 const L=new Float32Array(SR*4),R=new Float32Array(SR*4);for(let at=0;at<L.length;at+=128)e.process(L.subarray(at,at+128),R.subarray(at,at+128),Math.min(128,L.length-at));
 for(let i=0;i<L.length;i++)assert.equal(L[i],plain[i],`sample ${i}`);
});
test('Orbit notes start exactly on the shared sample clock, also with swing',()=>{
 for(const swing of [.5,.62]){
  const q=new Sequencer(48000),hits=[],stepTimes=[];let f=0;
  const layer={restart(){},stop(){},step(c){stepTimes[c]=f;if(c%2===0)hits.push(f);}};
  const e={layer,target:{fill:0},noteOn(){},noteOff(){},kickHit(){},drumHit(){},bassOn(){},bassOff(){}};
  q.configure({tempo:133,swing,patterns:[S.emptyPattern()],chain:[]});q.select(0);q.start(e);
  for(f=1;f<48000*20;f++)q.tick(e);
  const pulse=48000*60/133/2;hits.forEach((x,i)=>assert.ok(Math.abs(x-i*pulse)<=1,`pulse ${i}: ${x} vs ${i*pulse}`));
  assert.ok(hits.length>=80);
 }
});
test('the sidechain ducks Orbit under the kick',()=>{
 const d=JSON.parse(JSON.stringify(demos[0]));d.song.on=false;d.chain=[];d.patterns[0].steps.forEach(s=>{s.gate=false;s.bass=-1;s.hat=0;s.clap=false;s.snare=0;});d.params.fill=0;d.params.delay=0;d.params.reverb=0;d.params.kick=.001;
 demos.push(d);defs.push(defs[0]);
 try{
  const on=studio(d,{duck:1,send:0,seconds:4}).L,off=studio(d,{duck:0,send:0,seconds:4}).L;
  assert.ok(rms(on)<rms(off)*.98,`${rms(on)} vs ${rms(off)}`);
 }finally{demos.pop();defs.pop();}
});
test('mixer: Orbit level zero removes Orbit, and the layer is audible',()=>{
 const a=studio(demos[0],{level:0,seconds:16}),b=studio(demos[0],{level:.8,seconds:16});
 let diff=0;for(let i=0;i<a.L.length;i++)diff+=(a.L[i]-b.L[i])**2;assert.ok(Math.sqrt(diff/a.L.length)>.005);
 const quiet=studio(demos[0],{lead:0,level:0,seconds:16});assert.ok(rms(quiet.L)<rms(a.L));
});
test('at the default fader Orbit is clearly present but under the lead',()=>{
 for(const i of [0,6,10]){
  const full=studio(demos[i],{seconds:40}).L,noOrbit=studio(demos[i],{level:0,seconds:40}).L,noLead=studio(demos[i],{lead:0,seconds:40}).L,from=SR*14;
  let o=0,l=0;for(let n=from;n<full.length;n++){o+=(full[n]-noOrbit[n])**2;l+=(full[n]-noLead[n])**2;}
  const ratio=Math.sqrt(o/l);assert.ok(ratio>.25&&ratio<.9,`${demos[i].name} orbit/lead ${ratio}`);
 }
});
test('every timbre with every song family stays finite and below the limit',()=>{
 for(const [i,sound] of SOUNDS.entries()){
  const {L,R}=studio(demos[i%demos.length],{sound,level:1,send:1,seconds:6});let peak=0;
  for(let n=0;n<L.length;n++){assert.ok(Number.isFinite(L[n])&&Number.isFinite(R[n]));peak=Math.max(peak,Math.abs(L[n]),Math.abs(R[n]));}
  assert.ok(peak<=.95,`${sound} ${peak}`);assert.ok(rms(L)>.01,sound);
 }
});
test('Orbit plays only notes of the song key',()=>{
 for(const def of defs){
  const l=new OrbitLayer(SR);l.setScale(def.scale);const heard=[];l.noteOn=p=>heard.push(p);const t=timeline(9,.8);l.setPhrase(t.deg,t.beats);
  for(let c=0;c<t.deg.length*2;c++)l.step(c,100,{bass:c%32<16?-1:0,bassOct:0},false);
  assert.ok(heard.length>8,def.name);for(const p of heard)assert.ok(def.scale.includes(((p%12)+12)%12),`${def.name}: ${p}`);
  assert.ok(heard.every(p=>p>=48&&p<=90),`${def.name} range`);
 }
});
test('Orbit rests in sections that mute both lead and bass',()=>{
 const l=new OrbitLayer(SR),calls=[];l.setScale(defs[0].scale);l.noteOn=p=>calls.push(p);const t=timeline();l.setPhrase(t.deg,t.beats);
 for(let c=0;c<32;c++)l.step(c,100,null,true);assert.equal(calls.length,0);
 for(let c=0;c<32;c++)l.step(c,100,null,false);assert.ok(calls.length>0);
});
test('phrases are repeatable, bar aligned and valid',()=>{
 const a=timeline(11),b=timeline(11),c=timeline(12);
 assert.deepEqual([...a.deg],[...b.deg]);assert.notDeepEqual([...a.deg],[...c.deg]);assert.equal(a.deg.length%8,0);assert.equal(a.beats.length,a.deg.length);
 assert.ok(a.deg.every(d=>d>=-1&&d<=7));
});
test('stop fades voices quickly and leaves silence',()=>{
 const l=new OrbitLayer(SR);l.setScale(defs[0].scale);l.setSound('velvet');l.noteOn(60,.23,1.4);for(let i=0;i<4000;i++)l.process();assert.ok(l.on[0]);
 l.stop();for(let i=0;i<SR/2;i++)l.process();assert.equal(l.on[0],0);for(let i=0;i<SR;i++)l.process();assert.ok(Math.abs(l.l)<1e-4);
});
