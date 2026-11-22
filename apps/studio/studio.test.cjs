const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../acido/session.js'),{Engine}=require('../acido/engine.js'),{Sequencer}=require('../acido/sequencer.js'),{renderState}=require('../acido/render.js'),{demos,defs}=require('../acido/demos.js'),Flow=require('../orbit/flow.js');
const {OrbitLayer,SOUNDS,buildTimeline,buildPart}=require('./orbit-layer.js'),{Mixer,CHANNELS}=require('./mixer.js');
const NOTES=[0,4,2,6,4,7,2,3],SR=22050;
const timeline=(seed=3,amount=.35)=>buildTimeline(Flow,{notes:NOTES,amount,seed});
function studio(d,{level=.55,send=.3,sound='glass',lead=1,sr=SR,seconds=8,duck,params,mixer}={}){
 const e=new Engine(sr),q=new Sequencer(sr),l=new OrbitLayer(sr),state=JSON.parse(JSON.stringify(d));
 if(duck!==undefined)state.params.duck=duck;
 Object.assign(state.params,params);
 if(mixer){e.mixer=new Mixer(sr);mixer(e.mixer);}
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
const at=id=>CHANNELS.indexOf(id);
const wet={delay:.3,reverb:.3};
const neutral=(m,over={})=>{for(const id of CHANNELS)m.setStrip(at(id),{...(id==='lead'?wet:id==='snare'||id==='clap'?{reverb:.24}:{}),...over[id]});};
test('mixer: neutral strips match the plain Studio sum',()=>{
 const plain=studio(demos[0],{send:0,params:wet,seconds:10}).L,mixed=studio(demos[0],{send:0,params:wet,seconds:10,mixer:m=>neutral(m)}).L;
 let d=0;for(let i=0;i<plain.length;i++)d+=(plain[i]-mixed[i])**2;
 assert.ok(Math.sqrt(d/plain.length)<rms(plain)*.03,`difference ${Math.sqrt(d/plain.length)} of ${rms(plain)}`);
});
test('mixer: muting every channel leaves only silence',()=>{
 const {L,R}=studio(demos[0],{params:{delay:0,reverb:0},seconds:6,mixer:m=>{for(let i=0;i<CHANNELS.length;i++)m.setStrip(i,{mute:true});}});
 assert.equal(Math.max(...L.map(Math.abs)),0);assert.equal(Math.max(...R.map(Math.abs)),0);
});
test('mixer: solo keeps only the soloed channel and mute wins over solo',()=>{
 const run=over=>studio(demos[0],{seconds:6,mixer:m=>neutral(m,over)}).e.mixer;
 const dry={delay:0,reverb:0},solo=run({kick:{solo:true,...dry},lead:dry,snare:dry,clap:dry});
 assert.ok(solo.gL[at('kick')]>.99);for(const id of CHANNELS)if(id!=='kick')assert.ok(solo.gL[at(id)]<1e-3,id);
 const both=run({kick:{solo:true,mute:true}});assert.ok(both.gL[at('kick')]<1e-3);
});
test('mixer: hard pan empties the other side',()=>{
 const dry={delay:0,reverb:0},{L,R}=studio(demos[0],{send:0,level:0,seconds:6,params:dry,mixer:m=>{for(const id of CHANNELS)m.setStrip(at(id),{pan:-1});}});
 assert.ok(rms(L)>.01);assert.equal(rms(R),0);
});
test('mixer: a muted channel stops feeding the sends but its echo keeps ringing',()=>{
 const e=new Engine(SR),m=new Mixer(SR);e.mixer=m;e.reset();m.setStrip(0,{delay:1});m.reset();
 const L=new Float32Array(128),R=new Float32Array(128);e.noteOn(48,false,false);for(let b=0;b<40;b++)e.process(L,R,128);
 e.noteOff();m.setStrip(0,{mute:true,delay:1});for(let b=0;b<8;b++)e.process(L,R,128);
 assert.ok(Math.abs(m.delayIn)<1e-3,`send ${m.delayIn}`);
 let tail=0;for(let b=0;b<120;b++){e.process(L,R,128);tail=Math.max(tail,rms(L));}assert.ok(tail>1e-4,`tail ${tail}`);
});
test('mixer: full sends on every channel stay finite and below the limit',()=>{
 const {L,R}=studio(demos[6],{level:1,seconds:8,mixer:m=>{for(let i=0;i<CHANNELS.length;i++)m.setStrip(i,{delay:1,reverb:1});}});
 for(let i=0;i<L.length;i++){assert.ok(Number.isFinite(L[i])&&Number.isFinite(R[i]));assert.ok(Math.abs(L[i])<=.95&&Math.abs(R[i])<=.95);}
});
test('live control: a section jump lands on the next pattern, and loop holds the section',()=>{
 const P=()=>({...S.emptyPattern(),length:16}),q=new Sequencer(SR),e={target:{fill:0},noteOn(){},noteOff(){},kickHit(){},drumHit(){},bassOn(){},bassOff(){}};
 const song={on:true,sections:[{name:'A',patterns:[0],repeat:2,mute:{}},{name:'B',patterns:[1],repeat:1,mute:{}},{name:'C',patterns:[2],repeat:1,mute:{}}]};
 q.configure({tempo:120,swing:.5,patterns:[P(),P(),P()],chain:[],song});q.start(e);
 const bars=n=>{for(let i=0;i<Math.ceil(q.stepLen*16*n)+1;i++)q.tick(e);};
 q.queueSection(2);assert.equal(q.secI,0);bars(1);assert.equal(q.secI,2);assert.equal(q.pat,2);assert.equal(q.qSec,-1);
 q.loopSec=true;bars(5);assert.equal(q.secI,2);q.loopSec=false;bars(1);assert.equal(q.secI,0);
 q.stop(e);q.queueSection(1);q.start(e);assert.equal(q.secI,1);assert.equal(q.pat,1);
});
test('live control: key moves the chords of Orbit, octave moves its notes',()=>{
 const notes=(transpose,octave)=>{const l=new OrbitLayer(SR),out=[];l.transpose=transpose;l.octave=octave;l.setScale(defs[0].scale.map(p=>(p+transpose+24)%12));l.noteOn=p=>out.push(p);const x=timeline(5);l.setPhrase(x.deg,x.beats);for(let c=0;c<64;c++)l.step(c,100,{bass:defs[0].scale[0],bassOct:0},false);return out;};
 const base=notes(0,0);assert.deepEqual(notes(0,1),base.map(p=>p+12));
 for(const p of notes(3,0))assert.ok(defs[0].scale.map(x=>(x+3)%12).includes(((p%12)+12)%12),`${p}`);
});
test('live control: a held knob wins over the song automation',()=>{
 const e=new Engine(SR),q=new Sequencer(SR),p=S.emptyPattern();p.auto={cutoff:new Array(16).fill(.9)};e.sequence=q;q.configure({tempo:120,swing:.5,patterns:[p],chain:[]});q.select(0);q.start(e);
 const L=new Float32Array(128),R=new Float32Array(128),run=()=>{for(let b=0;b<40;b++)e.process(L,R,128);};
 run();assert.equal(e.auto.cutoff,.9);q.hold('cutoff',true,e);run();assert.equal(e.auto.cutoff,-1);q.hold('cutoff',false,e);run();assert.equal(e.auto.cutoff,.9);
});
test('a written Orbit part plays chords on the song position and rejects bad links',()=>{
 const song={on:true,sections:[{name:'A',patterns:[0],repeat:2,mute:{}},{name:'B',patterns:[1],repeat:1,mute:{}}]},state={song,patterns:[S.emptyPattern(),S.emptyPattern()]};
 const part=buildPart(state,{e:[0,48,4,0,55,4,20,60,2]}),l=new OrbitLayer(SR),heard=[],clock={secI:0,secRep:0,secPos:0,step:0};l.clock=clock;l.transpose=2;l.setPart(part);l.noteOn=p=>heard.push(p);
 l.step(0,100,null,false);assert.deepEqual(heard,[50,57]);heard.length=0;
 clock.secRep=1;clock.step=4;l.step(1,100,null,true);assert.equal(heard.length,0);l.step(1,100,null,false);assert.deepEqual(heard,[62]);
 for(const bad of [{e:[0,48]},{e:[9999,48,1]},{e:[-1,48,1]},{e:[0,127,1]},{e:[0,48,99]},{e:'x'}])assert.throws(()=>buildPart(state,bad));
 assert.throws(()=>buildPart({song:{on:false,sections:[]},patterns:[]},{e:[]}));
});
test('Orbit distortion is off by default, bounded when on and ignores bad values',()=>{
 const run=d=>{const l=new OrbitLayer(SR);l.setSound('rubber');if(d!==null)l.setDrive(d);for(const p of [40,47,52])l.noteOn(p,.16,1);const out=[];for(let i=0;i<4800;i++){l.process();out.push(l.l);}return out;};
 const off=run(null),hot=run(1);assert.deepEqual(run(0),off);assert.deepEqual(run(NaN),off);assert.notDeepEqual(hot,off);
 assert.ok(hot.every(Number.isFinite));assert.ok(Math.max(...hot.map(Math.abs))<1);
});
test('a MIDI import feeds a valid Orbit part on the same song grid',()=>{
 const M=require('../acido/midi.js'),vlq=v=>v>127?[v>>7|128,v&127]:[v],ev=[];
 for(let b=0;b<3;b++){const t=b*384;for(const [p,ch] of [[72,0],[36,1],[60,2],[64,2],[67,2],[36,9]])ev.push([t,0x90|ch,p,100],[t+48,0x80|ch,p,0]);}
 ev.sort((a,b)=>a[0]-b[0]);const data=[];let at=0;for(const [when,...x] of ev){data.push(...vlq(when-at),...x);at=when;}data.push(0,255,47,0);
 const file=Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,data.length>>8,data.length&255,...data]);
 const m=M.parseMidi(file),roles=M.suggestRoles(m);assert.deepEqual(m.parts.map((_,i)=>roles[i]),['lead','bass','orbit','drums']);
 const r=M.arrange(m,{roles,double:false});assert.equal(r.stats.orbit,9);
 const next=S.validate({patterns:r.patterns,song:r.song,tempo:r.tempo}),part=buildPart(next,{e:r.orbit.e});
 assert.equal(part.index[1]-part.index[0],3,'the chord starts on the first step');assert.equal(part.index[17]-part.index[16],3,'and again on the next bar');
});
test('stop fades voices quickly and leaves silence',()=>{
 const l=new OrbitLayer(SR);l.setScale(defs[0].scale);l.setSound('velvet');l.noteOn(60,.23,1.4);for(let i=0;i<4000;i++)l.process();assert.ok(l.on[0]);
 l.stop();for(let i=0;i<SR/2;i++)l.process();assert.equal(l.on[0],0);for(let i=0;i<SR;i++)l.process();assert.ok(Math.abs(l.l)<1e-4);
});
